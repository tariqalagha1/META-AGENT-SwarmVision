#include "Camera/CinematicDirector.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"
#include "EngineUtils.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogCinematic, Log, All);

ACinematicDirector::ACinematicDirector()
{
    PrimaryActorTick.bCanEverTick = true;
    PopulateDefaultShotMap();
    PopulateSwarmCompleteSequence();
}

// ─── Default shot map ─────────────────────────────────────────────────────────

void ACinematicDirector::PopulateDefaultShotMap()
{
    auto Add = [&](const TCHAR* Event, const TCHAR* Camera,
                   ECameraMotionType Motion, float Blend, float Hold,
                   int32 Prio, float FocalMM = 0.f, float Aperture = 0.f)
    {
        FCinematicShotConfig C;
        C.CameraName       = FName(Camera);
        C.MotionType       = Motion;
        C.BlendTime        = Blend;
        C.HoldDuration     = Hold;
        C.bCanBeInterrupted = Prio < 8;
        C.Priority         = Prio;
        C.FocalLengthMM    = FocalMM;
        C.Aperture         = Aperture;
        ShotMap.Add(FString(Event), C);
    };

    using M = ECameraMotionType;

    // Wide establishing → slow blend, 24mm wide
    Add(TEXT("SWARM_STARTED"),        TEXT("Camera_Entry"),      M::Blend,       1.4f, 7.0f, 7,  24.f, 2.8f);
    // Planner high angle — 50mm, slight push in
    Add(TEXT("PLANNER_DECISION"),     TEXT("Camera_Mezzanine"),  M::PushIn,      0.8f, 8.0f, 6,  50.f, 1.8f);
    // Agent step — zone-close, 85mm portrait
    Add(TEXT("AGENT_STEP_STARTED"),   TEXT("Camera_Fetch"),      M::Blend,       0.3f, 5.0f, 5,  85.f, 1.4f);
    Add(TEXT("AGENT_STEP_COMPLETED"), TEXT("Camera_Corridor"),   M::DollySpline, 0.0f, 4.0f, 4,  35.f, 2.0f);
    Add(TEXT("AGENT_STEP_FAILED"),    TEXT("Camera_Quality"),    M::Cut,         0.0f, 4.0f, 9,  50.f, 1.4f);
    Add(TEXT("AGENT_STEP_RETRY"),     TEXT("Camera_Fetch"),      M::Blend,       0.4f, 4.0f, 7,  85.f, 2.0f);
    // Handoff — wide corridor dolly
    Add(TEXT("TASK_HANDOFF"),         TEXT("Camera_Corridor"),   M::DollySpline, 0.0f, 8.0f, 5,  28.f, 2.8f);
    // Success — tight quality desk, 100mm
    Add(TEXT("TASK_SUCCESS"),         TEXT("Camera_Quality"),    M::PushIn,      0.5f, 5.0f, 8, 100.f, 1.2f);
    Add(TEXT("TASK_FAIL"),            TEXT("Camera_Quality"),    M::Cut,         0.0f, 4.0f, 9,  50.f, 1.4f);
    // Meta — mezzanine pull back reveal
    Add(TEXT("META_INSIGHT"),         TEXT("Camera_Mezzanine"),  M::PullBack,    0.6f, 6.0f, 5,  35.f, 2.8f);
    // Anomaly — hard cut wide, max urgency
    Add(TEXT("ANOMALY"),              TEXT("Camera_Entry"),      M::Cut,         0.0f, 3.0f, 10, 24.f, 4.0f);
    // Swarm complete handled by sequence
    Add(TEXT("SWARM_FAILED"),         TEXT("Camera_Quality"),    M::Cut,         0.0f, 5.0f, 10, 50.f, 1.4f);
}

void ACinematicDirector::PopulateSwarmCompleteSequence()
{
    // 3-shot cascade on SWARM_COMPLETED
    {
        FCinematicShotConfig S1;
        S1.CameraName    = TEXT("Camera_Quality");
        S1.MotionType    = ECameraMotionType::PullBack;
        S1.BlendTime     = 0.4f;
        S1.HoldDuration  = 4.0f;
        S1.Priority      = 8;
        S1.FocalLengthMM = 85.f;
        S1.Aperture      = 1.4f;
        SwarmCompleteSequence.Add(S1);
    }
    {
        FCinematicShotConfig S2;
        S2.CameraName    = TEXT("Camera_Corridor");
        S2.MotionType    = ECameraMotionType::DollySpline;
        S2.BlendTime     = 0.0f;
        S2.HoldDuration  = 5.0f;
        S2.Priority      = 8;
        S2.FocalLengthMM = 35.f;
        S2.Aperture      = 2.0f;
        S2.DollyConfig.SplineName     = TEXT("Dolly_CorridorSweep");
        S2.DollyConfig.TravelDuration = 5.0f;
        SwarmCompleteSequence.Add(S2);
    }
    {
        FCinematicShotConfig S3;
        S3.CameraName    = TEXT("Camera_Entry");
        S3.MotionType    = ECameraMotionType::PullBack;
        S3.BlendTime     = 1.2f;
        S3.HoldDuration  = 8.0f;
        S3.Priority      = 8;
        S3.FocalLengthMM = 24.f;
        S3.Aperture      = 2.8f;
        SwarmCompleteSequence.Add(S3);
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void ACinematicDirector::BeginPlay()
{
    Super::BeginPlay();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(
                this, &ACinematicDirector::OnSwarmEventReceived);
        }
    }

    ReturnToIdle();
}

void ACinematicDirector::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    GetWorldTimerManager().ClearTimer(HoldTimer);
    GetWorldTimerManager().ClearTimer(IdleTimer);

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ACinematicDirector::OnSwarmEventReceived);
        }
    }
    Super::EndPlay(EndPlayReason);
}

void ACinematicDirector::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    TickDolly(DeltaTime);
    TickFocusPull(DeltaTime);
}

// ─── Event handler ────────────────────────────────────────────────────────────

void ACinematicDirector::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    // SWARM_COMPLETED plays compound sequence
    if (Event.EventType == ESwarmEventType::SwarmCompleted)
    {
        PlayShotSequence(SwarmCompleteSequence);
        return;
    }

    const FString TypeStr = UEnum::GetValueAsString(Event.EventType);
    FString CleanType;
    int32 Colon;
    if (TypeStr.FindLastChar(TEXT(':'), Colon))
        CleanType = TypeStr.RightChop(Colon + 1);
    else
        CleanType = TypeStr;

    const FCinematicShotConfig* Config = ShotMap.Find(CleanType);
    if (!Config)
    {
        // Reset idle timer
        GetWorldTimerManager().ClearTimer(IdleTimer);
        GetWorldTimerManager().SetTimer(
            IdleTimer, this, &ACinematicDirector::ReturnToIdle,
            IdleReturnDelay, false);
        return;
    }

    // Priority check — don't interrupt higher-priority shots
    if (bPlayingSequence && Config->Priority < ActiveShotPriority)
    {
        return;
    }

    ActivateShotConfig(*Config, Event);
}

// ─── ActivateShotConfig ───────────────────────────────────────────────────────

void ACinematicDirector::ActivateShotConfig(const FCinematicShotConfig& Config,
                                              const FSwarmEvent& TriggerEvent)
{
    bDollying          = false;
    ActiveShot         = Config;
    ActiveShotPriority = Config.Priority;

    ACameraActor* Camera = FindCameraByName(Config.CameraName);
    if (!Camera)
    {
        UE_LOG(LogCinematic, Warning, TEXT("Camera not found: %s"), *Config.CameraName.ToString());
        return;
    }

    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (!PC) return;

    // Apply CineCamera settings if applicable
    ActiveCineCamera = Cast<ACineCameraActor>(Camera);
    if (ActiveCineCamera)
    {
        ApplyCineCameraSettings(ActiveCineCamera, Config);
    }

    switch (Config.MotionType)
    {
    case ECameraMotionType::Cut:
        PC->SetViewTarget(Camera);
        break;

    case ECameraMotionType::Blend:
    case ECameraMotionType::PushIn:
    case ECameraMotionType::PullBack:
        PC->SetViewTargetWithBlend(Camera, FMath::Max(Config.BlendTime, 0.016f),
                                   EViewTargetBlendFunction::VTBlend_EaseInOut, 2.0f);
        break;

    case ECameraMotionType::DollySpline:
    {
        USplineComponent* Spline = FindSplineByName(Config.DollyConfig.SplineName);
        AActor* LookAt = FindActorByName(Config.DollyConfig.LookAtActorName);
        if (Spline)
        {
            PC->SetViewTarget(Camera);
            StartDollyMove(Spline, Config.DollyConfig.TravelDuration,
                           Config.DollyConfig.EaseInFraction,
                           Config.DollyConfig.EaseOutFraction,
                           LookAt);
        }
        else
        {
            PC->SetViewTargetWithBlend(Camera, Config.BlendTime,
                                       EViewTargetBlendFunction::VTBlend_EaseInOut, 2.0f);
        }
        break;
    }

    case ECameraMotionType::OrbitSubject:
        PC->SetViewTargetWithBlend(Camera, Config.BlendTime,
                                   EViewTargetBlendFunction::VTBlend_EaseInOut, 2.0f);
        break;
    }

    if (!Config.FocusSubjectName.IsNone() && ActiveCineCamera)
    {
        SetFocusTarget(ActiveCineCamera, Config.FocusSubjectName);
    }

    GetWorldTimerManager().ClearTimer(HoldTimer);
    GetWorldTimerManager().ClearTimer(IdleTimer);

    if (!bPlayingSequence)
    {
        const float Hold = Config.HoldDuration;
        GetWorldTimerManager().SetTimer(
            HoldTimer, [this]() { ReturnToIdle(); }, Hold, false);
    }

    UE_LOG(LogCinematic, Log, TEXT("Shot → %s [%s] blend=%.2f hold=%.1f prio=%d"),
           *Config.CameraName.ToString(),
           *UEnum::GetValueAsString(Config.MotionType),
           Config.BlendTime, Config.HoldDuration, Config.Priority);

    BP_OnShotActivated(Config, TriggerEvent);
}

// ─── PlayShotSequence ─────────────────────────────────────────────────────────

void ACinematicDirector::PlayShotSequence(const TArray<FCinematicShotConfig>& Sequence)
{
    if (Sequence.IsEmpty()) return;

    ShotQueue        = Sequence;
    ShotQueueIndex   = 0;
    bPlayingSequence = true;

    AdvanceShotQueue();
}

void ACinematicDirector::AdvanceShotQueue()
{
    if (!bPlayingSequence || ShotQueueIndex >= ShotQueue.Num())
    {
        bPlayingSequence = false;
        BP_OnSequenceComplete();
        ReturnToIdle();
        return;
    }

    const FCinematicShotConfig& NextShot = ShotQueue[ShotQueueIndex++];
    FSwarmEvent Dummy;
    ActivateShotConfig(NextShot, Dummy);

    const float Hold = NextShot.HoldDuration;
    GetWorldTimerManager().SetTimer(
        HoldTimer,
        [this]() { AdvanceShotQueue(); },
        Hold, false);
}

// ─── StartDollyMove ───────────────────────────────────────────────────────────

void ACinematicDirector::StartDollyMove(USplineComponent* Spline, float Duration,
                                          float EaseIn, float EaseOut, AActor* LookAtActor)
{
    if (!Spline || !ActiveCineCamera) return;

    ActiveDollySpline  = Spline;
    DollyDuration      = FMath::Max(Duration, 0.1f);
    DollyEaseIn        = EaseIn;
    DollyEaseOut       = EaseOut;
    DollyLookAtActor   = LookAtActor;
    DollyProgress      = 0.f;
    bDollying          = true;
}

// ─── ReturnToIdle ─────────────────────────────────────────────────────────────

void ACinematicDirector::ReturnToIdle()
{
    bPlayingSequence   = false;
    ActiveShotPriority = 0;
    bDollying          = false;

    GetWorldTimerManager().ClearTimer(HoldTimer);

    ACameraActor* IdleCam = FindCameraByName(IdleCameraName);
    if (!IdleCam) return;

    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (!PC) return;

    PC->SetViewTargetWithBlend(IdleCam, 2.5f,
                               EViewTargetBlendFunction::VTBlend_EaseInOut, 3.0f);

    // Start idle sweeps
    if (!IdleDollySplineNames.IsEmpty())
    {
        GetWorldTimerManager().SetTimer(
            IdleTimer,
            [this]() { TickIdleSweep(0.f); },
            IdleReturnDelay + 2.0f, false);
    }
}

// ─── TickDolly ───────────────────────────────────────────────────────────────

void ACinematicDirector::TickDolly(float DeltaTime)
{
    if (!bDollying || !ActiveDollySpline || !ActiveCineCamera)
    {
        return;
    }

    DollyProgress = FMath::Clamp(DollyProgress + DeltaTime / DollyDuration, 0.f, 1.f);

    // Eased alpha
    float Alpha = DollyProgress;
    if (Alpha < DollyEaseIn)
    {
        Alpha = FMath::InterpEaseIn(0.f, DollyEaseIn, Alpha / DollyEaseIn, 2.f);
        Alpha = Alpha * DollyEaseIn / DollyEaseIn;
    }
    else if (Alpha > (1.f - DollyEaseOut))
    {
        const float LocalT = (Alpha - (1.f - DollyEaseOut)) / DollyEaseOut;
        Alpha = (1.f - DollyEaseOut) + FMath::InterpEaseOut(0.f, DollyEaseOut, LocalT, 2.f);
    }

    const float Dist = Alpha * ActiveDollySpline->GetSplineLength();
    const FVector NewPos = ActiveDollySpline->GetLocationAtDistanceAlongSpline(
        Dist, ESplineCoordinateSpace::World);

    FRotator NewRot;
    if (DollyLookAtActor)
    {
        const FVector LookDir = (DollyLookAtActor->GetActorLocation() +
                                  FVector(0.f, 0.f, 160.f) - NewPos).GetSafeNormal();
        NewRot = LookDir.Rotation();
    }
    else
    {
        NewRot = ActiveDollySpline->GetRotationAtDistanceAlongSpline(
            Dist, ESplineCoordinateSpace::World);
    }

    ActiveCineCamera->SetActorLocationAndRotation(NewPos, NewRot);

    if (DollyProgress >= 1.f)
    {
        bDollying = false;
        BP_OnDollyComplete(ActiveShot.DollyConfig.SplineName);
    }
}

// ─── TickFocusPull ────────────────────────────────────────────────────────────

void ACinematicDirector::TickFocusPull(float DeltaTime)
{
    if (!ActiveCineCamera) return;
    if (FMath::IsNearlyEqual(CurrentFocusDist, TargetFocusDist, 0.5f)) return;

    CurrentFocusDist = FMath::FInterpTo(CurrentFocusDist, TargetFocusDist,
                                         DeltaTime, FocusPullSpeed);

    UCineCameraComponent* CineComp = ActiveCineCamera->GetCineCameraComponent();
    if (CineComp)
    {
        CineComp->FocusSettings.ManualFocusDistance = CurrentFocusDist;
    }
}

// ─── TickIdleSweep ────────────────────────────────────────────────────────────

void ACinematicDirector::TickIdleSweep(float DeltaTime)
{
    if (IdleDollySplineNames.IsEmpty()) return;

    const FName SplineName = IdleDollySplineNames[
        IdleSweepIndex % IdleDollySplineNames.Num()];
    ++IdleSweepIndex;

    USplineComponent* Spline = FindSplineByName(SplineName);
    if (Spline && ActiveCineCamera)
    {
        StartDollyMove(Spline, IdleSweepDuration, 0.3f, 0.3f, nullptr);
    }

    GetWorldTimerManager().SetTimer(
        IdleTimer,
        [this]() { TickIdleSweep(0.f); },
        IdleSweepDuration + 1.0f, false);
}

// ─── ApplyCineCameraSettings ──────────────────────────────────────────────────

void ACinematicDirector::ApplyCineCameraSettings(ACineCameraActor* CineCamera,
                                                   const FCinematicShotConfig& Config)
{
    UCineCameraComponent* CineComp = CineCamera->GetCineCameraComponent();
    if (!CineComp) return;

    if (Config.FocalLengthMM > 0.f)
    {
        CineComp->SetCurrentFocalLength(Config.FocalLengthMM);
    }
    if (Config.Aperture > 0.f)
    {
        CineComp->CurrentAperture = Config.Aperture;
    }

    const float StartFocus = Config.DollyConfig.FocusDistanceStart;
    const float EndFocus   = Config.DollyConfig.FocusDistanceEnd;

    if (StartFocus > 0.f)
    {
        CineComp->FocusSettings.FocusMethod = ECameraFocusMethod::Manual;
        CineComp->FocusSettings.ManualFocusDistance = StartFocus;
        CurrentFocusDist = StartFocus;
        TargetFocusDist  = (EndFocus > 0.f) ? EndFocus : StartFocus;
    }
}

void ACinematicDirector::SetFocusTarget(ACineCameraActor* CineCamera, const FName& SubjectName)
{
    AActor* Subject = FindActorByName(SubjectName);
    if (!Subject) return;

    UCineCameraComponent* CineComp = CineCamera->GetCineCameraComponent();
    if (!CineComp) return;

    CineComp->FocusSettings.FocusMethod = ECameraFocusMethod::Tracking;
    CineComp->FocusSettings.TrackingFocusSettings.ActorToTrack = Subject;
    CineComp->FocusSettings.TrackingFocusSettings.RelativeOffset = FVector(0.f, 0.f, 160.f);
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

ACameraActor* ACinematicDirector::FindCameraByName(const FName& Name) const
{
    for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It)
    {
        if (It->GetFName() == Name || It->GetActorLabel() == Name.ToString())
        {
            return *It;
        }
    }
    return nullptr;
}

USplineComponent* ACinematicDirector::FindSplineByName(const FName& Name) const
{
    if (Name.IsNone()) return nullptr;

    for (TActorIterator<AActor> It(GetWorld()); It; ++It)
    {
        TArray<USplineComponent*> Splines;
        It->GetComponents<USplineComponent>(Splines);
        for (USplineComponent* S : Splines)
        {
            if (S->GetFName() == Name)
            {
                return S;
            }
        }
    }
    return nullptr;
}

AActor* ACinematicDirector::FindActorByName(const FName& Name) const
{
    if (Name.IsNone()) return nullptr;

    for (TActorIterator<AActor> It(GetWorld()); It; ++It)
    {
        if (It->GetFName() == Name || It->GetActorLabel() == Name.ToString())
        {
            return *It;
        }
    }
    return nullptr;
}
