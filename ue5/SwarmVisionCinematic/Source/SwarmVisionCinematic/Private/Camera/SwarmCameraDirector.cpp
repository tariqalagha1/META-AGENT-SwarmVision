#include "Camera/SwarmCameraDirector.h"

#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"
#include "EngineUtils.h"

DEFINE_LOG_CATEGORY_STATIC(LogSwarmCamera, Log, All);

ASwarmCameraDirector::ASwarmCameraDirector()
{
    PrimaryActorTick.bCanEverTick = false;
    PopulateDefaultEventMap();
}

// ─── Default event → camera mapping ──────────────────────────────────────────
// Mirrors the camera priority table from the architecture document.
// All camera names must match ACameraActor actors placed in the level.

void ASwarmCameraDirector::PopulateDefaultEventMap()
{
    auto AddMapping = [&](const TCHAR* EventType, const TCHAR* CamName,
                          float Blend, float Hold, bool bInterruptible)
    {
        FShotConfig Cfg;
        Cfg.CameraName          = FName(CamName);
        Cfg.BlendTime           = Blend;
        Cfg.HoldDuration        = Hold;
        Cfg.bCanBeInterrupted   = bInterruptible;
        EventCameraMap.Add(FString(EventType), Cfg);
    };

    // Swarm lifecycle
    AddMapping(TEXT("SWARM_STARTED"),        TEXT("Camera_Entry"),      1.2f, 6.0f,  true);
    AddMapping(TEXT("SWARM_COMPLETED"),      TEXT("Camera_Gate"),       0.0f, 14.0f, false);
    AddMapping(TEXT("SWARM_FAILED"),         TEXT("Camera_Quality"),    0.0f, 4.0f,  false);

    // Planner — mezzanine reveal
    AddMapping(TEXT("PLANNER_DECISION"),     TEXT("Camera_Mezzanine"),  0.8f, 7.0f,  true);

    // Agent steps — zone-specific cameras
    AddMapping(TEXT("AGENT_STEP_STARTED"),   TEXT("Camera_Fetch"),      0.3f, 4.0f,  true);
    AddMapping(TEXT("AGENT_STEP_COMPLETED"), TEXT("Camera_Corridor"),   0.0f, 3.0f,  true);
    AddMapping(TEXT("AGENT_STEP_FAILED"),    TEXT("Camera_Quality"),    0.0f, 3.5f,  false);
    AddMapping(TEXT("AGENT_STEP_RETRY"),     TEXT("Camera_Corridor"),   0.0f, 3.0f,  false);

    // Handoff — corridor tracking
    AddMapping(TEXT("TASK_HANDOFF"),         TEXT("Camera_Corridor"),   0.0f, 7.0f,  true);

    // Quality verdict
    AddMapping(TEXT("TASK_SUCCESS"),         TEXT("Camera_Quality"),    0.4f, 4.0f,  false);
    AddMapping(TEXT("TASK_FAIL"),            TEXT("Camera_Quality"),    0.0f, 3.5f,  false);

    // Meta and anomaly
    AddMapping(TEXT("META_INSIGHT"),         TEXT("Camera_Corridor"),   0.6f, 5.0f,  true);
    AddMapping(TEXT("ANOMALY"),              TEXT("Camera_Entry"),      0.0f, 2.0f,  false);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void ASwarmCameraDirector::BeginPlay()
{
    Super::BeginPlay();

    UGameInstance* GI = GetGameInstance();
    if (!GI) return;

    USwarmEventRouterSubsystem* Router =
        GI->GetSubsystem<USwarmEventRouterSubsystem>();
    if (!Router) return;

    Router->OnSwarmEventReceived.AddDynamic(
        this, &ASwarmCameraDirector::OnSwarmEventReceived);

    // Start on idle camera
    ReturnToIdle();

    UE_LOG(LogSwarmCamera, Log,
           TEXT("SwarmCameraDirector ready — %d event mappings, idle=%s"),
           EventCameraMap.Num(), *IdleCameraName.ToString());
}

void ASwarmCameraDirector::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    GetWorldTimerManager().ClearTimer(IdleReturnTimer);
    GetWorldTimerManager().ClearTimer(HoldTimer);

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router =
                GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ASwarmCameraDirector::OnSwarmEventReceived);
        }
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Event handler ────────────────────────────────────────────────────────────

void ASwarmCameraDirector::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    const FString TypeStr = UEnum::GetValueAsString(Event.EventType);
    // Strip namespace prefix
    FString CleanType = TypeStr;
    int32 ColonIdx;
    if (CleanType.FindLastChar(TEXT(':'), ColonIdx))
        CleanType = CleanType.RightChop(ColonIdx + 1);

    const FShotConfig* Config = EventCameraMap.Find(CleanType);
    if (!Config)
    {
        // No camera mapping for this event — reset idle timer only
        GetWorldTimerManager().ClearTimer(IdleReturnTimer);
        GetWorldTimerManager().SetTimer(
            IdleReturnTimer, this,
            &ASwarmCameraDirector::ReturnToIdle,
            IdleReturnDelay, false
        );
        return;
    }

    ActivateCamera(Config->CameraName, Config->BlendTime, Event);

    // Schedule hold → idle return
    GetWorldTimerManager().ClearTimer(HoldTimer);
    GetWorldTimerManager().ClearTimer(IdleReturnTimer);

    const float HoldTime = Config->HoldDuration;
    GetWorldTimerManager().SetTimer(
        HoldTimer, [this]() { ReturnToIdle(); },
        HoldTime, false
    );
}

// ─── Camera activation ────────────────────────────────────────────────────────

void ASwarmCameraDirector::ActivateCamera(
    const FName& CameraName,
    float BlendTime,
    const FSwarmEvent& TriggerEvent)
{
    if (CameraName == CurrentCameraName) return;

    ACameraActor* Camera = FindCameraByName(CameraName);
    if (!Camera)
    {
        UE_LOG(LogSwarmCamera, Warning,
               TEXT("Camera not found in level: %s"), *CameraName.ToString());
        return;
    }

    APlayerController* PC =
        UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (!PC) return;

    if (BlendTime > 0.f)
    {
        PC->SetViewTargetWithBlend(
            Camera, BlendTime,
            EViewTargetBlendFunction::VTBlend_EaseInOut, 2.0f
        );
    }
    else
    {
        PC->SetViewTarget(Camera);
    }

    CurrentCameraName = CameraName;

    UE_LOG(LogSwarmCamera, Log,
           TEXT("Camera → %s (blend=%.2fs) triggered by %s"),
           *CameraName.ToString(), BlendTime,
           *UEnum::GetValueAsString(TriggerEvent.EventType));

    OnCameraActivated(CameraName, TriggerEvent);
}

void ASwarmCameraDirector::ReturnToIdle()
{
    FSwarmEvent IdleEvent;
    IdleEvent.EventType = ESwarmEventType::Unknown;
    ActivateCamera(IdleCameraName, 2.0f, IdleEvent);
}

// ─── Camera lookup ────────────────────────────────────────────────────────────

ACameraActor* ASwarmCameraDirector::FindCameraByName(const FName& Name) const
{
    for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It)
    {
        if (It->GetFName() == Name || It->GetActorLabel() == Name.ToString())
            return *It;
    }
    return nullptr;
}
