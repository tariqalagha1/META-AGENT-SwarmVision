#include "FX/AtmosphereController.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Engine/ExponentialHeightFog.h"
#include "Components/ExponentialHeightFogComponent.h"

AAtmosphereController::AAtmosphereController()
{
    PrimaryActorTick.bCanEverTick = true;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    PostProcess = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostProcess"));
    PostProcess->SetupAttachment(Root);
    PostProcess->bUnbound = true; // affects entire scene

    AmbientDust = CreateDefaultSubobject<UNiagaraComponent>(TEXT("AmbientDust"));
    AmbientDust->SetupAttachment(Root);
    AmbientDust->bAutoActivate = false;

    VolumetricHaze = CreateDefaultSubobject<UNiagaraComponent>(TEXT("VolumetricHaze"));
    VolumetricHaze->SetupAttachment(Root);
    VolumetricHaze->bAutoActivate = false;

    // Default states
    State_Dormant.FogDensity              = 0.008f;
    State_Dormant.FogInscatteringColor    = FLinearColor(0.01f, 0.01f, 0.02f);
    State_Dormant.BloomIntensity          = 0.4f;
    State_Dormant.BloomThreshold          = 2.0f;
    State_Dormant.VignetteIntensity       = 0.7f;
    State_Dormant.ChromaticAberration     = 0.02f;
    State_Dormant.FlickerAmplitude        = 0.0f;
    State_Dormant.GrainIntensity          = 0.12f;
    State_Dormant.TransitionDuration      = 3.0f;

    State_Active.FogDensity               = 0.02f;
    State_Active.FogInscatteringColor     = FLinearColor(0.02f, 0.03f, 0.06f);
    State_Active.BloomIntensity           = 1.2f;
    State_Active.BloomThreshold           = 0.8f;
    State_Active.VignetteIntensity        = 0.45f;
    State_Active.ChromaticAberration      = 0.06f;
    State_Active.FlickerAmplitude         = 0.0f;
    State_Active.GrainIntensity           = 0.08f;
    State_Active.TransitionDuration       = 1.5f;

    State_Anomaly.FogDensity              = 0.04f;
    State_Anomaly.FogInscatteringColor    = FLinearColor(0.08f, 0.01f, 0.01f);
    State_Anomaly.BloomIntensity          = 2.0f;
    State_Anomaly.BloomThreshold          = 0.3f;
    State_Anomaly.VignetteIntensity       = 0.85f;
    State_Anomaly.ChromaticAberration     = 0.25f;
    State_Anomaly.FlickerAmplitude        = 0.18f;
    State_Anomaly.GrainIntensity          = 0.25f;
    State_Anomaly.TransitionDuration      = 0.15f; // instant

    State_Failed.FogDensity               = 0.03f;
    State_Failed.FogInscatteringColor     = FLinearColor(0.05f, 0.01f, 0.01f);
    State_Failed.BloomIntensity           = 0.6f;
    State_Failed.BloomThreshold           = 1.5f;
    State_Failed.VignetteIntensity        = 0.75f;
    State_Failed.ChromaticAberration      = 0.10f;
    State_Failed.FlickerAmplitude         = 0.05f;
    State_Failed.GrainIntensity           = 0.18f;
    State_Failed.TransitionDuration       = 0.8f;

    State_Complete.FogDensity             = 0.012f;
    State_Complete.FogInscatteringColor   = FLinearColor(0.02f, 0.04f, 0.02f);
    State_Complete.BloomIntensity         = 1.8f;
    State_Complete.BloomThreshold         = 0.6f;
    State_Complete.VignetteIntensity      = 0.3f;
    State_Complete.ChromaticAberration    = 0.02f;
    State_Complete.FlickerAmplitude       = 0.0f;
    State_Complete.GrainIntensity         = 0.06f;
    State_Complete.TransitionDuration     = 2.5f;
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void AAtmosphereController::BeginPlay()
{
    Super::BeginPlay();

    CurrentState = State_Dormant;
    TargetState  = State_Dormant;
    AtmosphereAlpha = 1.f;

    ApplyAtmosphereStateDirect(State_Dormant);
    AmbientDust->Activate(true);
    VolumetricHaze->Activate(true);

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(
                this, &AAtmosphereController::OnSwarmEventReceived);
        }
    }
}

void AAtmosphereController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &AAtmosphereController::OnSwarmEventReceived);
        }
    }
    Super::EndPlay(EndPlayReason);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void AAtmosphereController::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    TickAtmosphereInterp(DeltaTime);
    TickFlicker(DeltaTime);
    TickEmissiveDrift(DeltaTime);
}

// ─── Event handler ───────────────────────────────────────────────────────────

void AAtmosphereController::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    switch (Event.EventType)
    {
    case ESwarmEventType::SwarmStarted:
        TransitionToAtmosphereState(State_Active);
        break;

    case ESwarmEventType::Anomaly:
        TransitionToAtmosphereState(State_Anomaly);
        TriggerFlicker(1.2f, 0.3f);
        break;

    case ESwarmEventType::SwarmFailed:
    case ESwarmEventType::AgentStepFailed:
        TransitionToAtmosphereState(State_Failed);
        TriggerFlicker(0.4f, 0.15f);
        break;

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
    {
        // Shift back toward active from anomaly/failed
        FAtmosphereState RetryState = State_Active;
        RetryState.VignetteIntensity   = 0.6f;
        RetryState.ChromaticAberration = 0.12f;
        RetryState.TransitionDuration  = 1.0f;
        TransitionToAtmosphereState(RetryState);
        break;
    }

    case ESwarmEventType::SwarmCompleted:
    case ESwarmEventType::TaskSuccess:
        TransitionToAtmosphereState(State_Complete);
        break;

    case ESwarmEventType::MetaInsight:
    {
        // Subtle bloom pulse — temporary brightness, then settle
        FAtmosphereState InsightState = CurrentState;
        InsightState.BloomIntensity  *= 1.6f;
        InsightState.TransitionDuration = 0.3f;
        TransitionToAtmosphereState(InsightState);
        // Fade back after 1s (simple approach: schedule another transition)
        FTimerHandle TH;
        GetWorldTimerManager().SetTimer(TH, [this]()
        {
            TransitionToAtmosphereState(State_Active);
        }, 1.0f, false);
        break;
    }

    default:
        break;
    }
}

// ─── TransitionToAtmosphereState ─────────────────────────────────────────────

void AAtmosphereController::TransitionToAtmosphereState(const FAtmosphereState& Target)
{
    TargetState          = Target;
    AtmosphereDuration   = FMath::Max(Target.TransitionDuration, 0.016f);
    AtmosphereAlpha      = 0.f;
    BP_OnAtmosphereStateChanged(Target);
}

// ─── TriggerFlicker ───────────────────────────────────────────────────────────

void AAtmosphereController::TriggerFlicker(float Duration, float Intensity)
{
    bFlickering      = true;
    FlickerTimer     = Duration;
    FlickerDuration  = Duration;
    FlickerIntensity = Intensity;
    FlickerPhase     = 0.f;
}

// ─── TickAtmosphereInterp ─────────────────────────────────────────────────────

void AAtmosphereController::TickAtmosphereInterp(float DeltaTime)
{
    if (AtmosphereAlpha >= 1.f) return;

    AtmosphereAlpha = FMath::Clamp(
        AtmosphereAlpha + DeltaTime / AtmosphereDuration, 0.f, 1.f);
    const float Alpha = FMath::SmoothStep(0.f, 1.f, AtmosphereAlpha);

    // Interpolate fog
    if (SceneHeightFog && SceneHeightFog->GetComponent())
    {
        auto* FogComp = SceneHeightFog->GetComponent();
        FogComp->SetFogDensity(FMath::Lerp(CurrentState.FogDensity,
                                            TargetState.FogDensity, Alpha));
        FogComp->SetFogInscatteringColor(FLinearColor::LerpUsingHSV(
            CurrentState.FogInscatteringColor, TargetState.FogInscatteringColor, Alpha));
        FogComp->SetStartDistance(FMath::Lerp(CurrentState.FogStartDistance,
                                               TargetState.FogStartDistance, Alpha));
    }

    // Interpolate post-process
    FPostProcessSettings& PP = PostProcess->Settings;
    PP.BloomIntensity      = FMath::Lerp(CurrentState.BloomIntensity,
                                          TargetState.BloomIntensity, Alpha);
    PP.BloomThreshold      = FMath::Lerp(CurrentState.BloomThreshold,
                                          TargetState.BloomThreshold, Alpha);
    PP.VignetteIntensity   = FMath::Lerp(CurrentState.VignetteIntensity,
                                          TargetState.VignetteIntensity, Alpha);
    PP.SceneFringeIntensity = FMath::Lerp(CurrentState.ChromaticAberration,
                                           TargetState.ChromaticAberration, Alpha);
    PP.GrainIntensity      = FMath::Lerp(CurrentState.GrainIntensity,
                                          TargetState.GrainIntensity, Alpha);

    PP.bOverride_BloomIntensity      = true;
    PP.bOverride_BloomThreshold      = true;
    PP.bOverride_VignetteIntensity   = true;
    PP.bOverride_SceneFringeIntensity = true;
    PP.bOverride_GrainIntensity      = true;

    // Haze intensity via MPC
    if (AtmosphereMPC && GetWorld() && !MPC_HazeIntensityParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), AtmosphereMPC, MPC_HazeIntensityParam,
            FMath::Lerp(CurrentState.FogDensity, TargetState.FogDensity, Alpha) * 10.f);
    }

    if (AtmosphereAlpha >= 1.f)
    {
        CurrentState = TargetState;
    }
}

// ─── TickFlicker ─────────────────────────────────────────────────────────────

void AAtmosphereController::TickFlicker(float DeltaTime)
{
    if (!bFlickering)
    {
        return;
    }

    FlickerTimer -= DeltaTime;
    FlickerPhase += DeltaTime * 18.f; // ~18 Hz flicker

    const float FlickerNoise = (0.5f + 0.5f * FMath::Sin(FlickerPhase)) *
                                FMath::Sin(FlickerPhase * 2.3f + 0.7f);
    const float FlickerVal   = FlickerNoise * FlickerIntensity * (FlickerTimer / FlickerDuration);

    if (AtmosphereMPC && GetWorld() && !MPC_FlickerParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), AtmosphereMPC, MPC_FlickerParam, FMath::Clamp(FlickerVal, 0.f, 1.f));
    }

    if (FlickerTimer <= 0.f)
    {
        bFlickering = false;
        if (AtmosphereMPC && GetWorld() && !MPC_FlickerParam.IsNone())
        {
            UKismetMaterialLibrary::SetScalarParameterValue(
                GetWorld(), AtmosphereMPC, MPC_FlickerParam, 0.f);
        }
    }
}

// ─── TickEmissiveDrift ────────────────────────────────────────────────────────

void AAtmosphereController::TickEmissiveDrift(float DeltaTime)
{
    EmissiveDriftTime += DeltaTime * EmissiveDriftSpeed;

    if (AtmosphereMPC && GetWorld() && !MPC_EmissiveDriftParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), AtmosphereMPC, MPC_EmissiveDriftParam, EmissiveDriftTime);
    }
}

// ─── ApplyAtmosphereStateDirect ───────────────────────────────────────────────

void AAtmosphereController::ApplyAtmosphereStateDirect(const FAtmosphereState& State)
{
    if (SceneHeightFog && SceneHeightFog->GetComponent())
    {
        auto* FogComp = SceneHeightFog->GetComponent();
        FogComp->SetFogDensity(State.FogDensity);
        FogComp->SetFogInscatteringColor(State.FogInscatteringColor);
        FogComp->SetStartDistance(State.FogStartDistance);
    }

    FPostProcessSettings& PP = PostProcess->Settings;
    PP.BloomIntensity       = State.BloomIntensity;
    PP.BloomThreshold       = State.BloomThreshold;
    PP.VignetteIntensity    = State.VignetteIntensity;
    PP.SceneFringeIntensity = State.ChromaticAberration;
    PP.GrainIntensity       = State.GrainIntensity;
    PP.bOverride_BloomIntensity      = true;
    PP.bOverride_BloomThreshold      = true;
    PP.bOverride_VignetteIntensity   = true;
    PP.bOverride_SceneFringeIntensity = true;
    PP.bOverride_GrainIntensity      = true;
}
