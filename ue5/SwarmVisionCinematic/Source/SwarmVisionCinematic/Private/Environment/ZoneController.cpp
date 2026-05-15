#include "Environment/ZoneController.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Materials/MaterialParameterCollection.h"
#include "NiagaraFunctionLibrary.h"
#include "Engine/World.h"
#include "GameFramework/GameStateBase.h"

// ─── static intensity table ──────────────────────────────────────────────────

float AZoneController::IntensityForState(EZoneState State)
{
    switch (State)
    {
    case EZoneState::Dark:     return 0.f;
    case EZoneState::Idle:     return 800.f;
    case EZoneState::Active:   return 3000.f;
    case EZoneState::Handoff:  return 2200.f;
    case EZoneState::Success:  return 4000.f;
    case EZoneState::Failed:   return 1200.f;
    case EZoneState::Retry:    return 2500.f;
    default:                   return 0.f;
    }
}

// ─── static color selector ───────────────────────────────────────────────────

FLinearColor AZoneController::ColorForState(EZoneState State, const FZoneColors& ZoneColors)
{
    switch (State)
    {
    case EZoneState::Dark:     return FLinearColor::Black;
    case EZoneState::Idle:     return ZoneColors.Ambient;
    case EZoneState::Active:   return ZoneColors.Primary;
    case EZoneState::Handoff:  return ZoneColors.Highlight;
    case EZoneState::Success:  return FLinearColor(0.1f, 1.0f, 0.3f); // universal success green
    case EZoneState::Failed:   return FLinearColor(1.0f, 0.05f, 0.05f); // universal fail red
    case EZoneState::Retry:    return FLinearColor(1.0f, 0.55f, 0.0f); // universal retry amber
    default:                   return FLinearColor::Black;
    }
}

// ─── constructor ─────────────────────────────────────────────────────────────

AZoneController::AZoneController()
{
    PrimaryActorTick.bCanEverTick = true;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    KeyLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("KeyLight"));
    KeyLight->SetupAttachment(Root);
    KeyLight->SetRelativeLocation(FVector(0.f, 0.f, 240.f));
    KeyLight->Intensity = 0.f;
    KeyLight->AttenuationRadius = 600.f;
    KeyLight->bUseInverseSquaredFalloff = false;

    FillLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("FillLight"));
    FillLight->SetupAttachment(Root);
    FillLight->SetRelativeLocation(FVector(0.f, 0.f, 80.f));
    FillLight->Intensity = 0.f;
    FillLight->AttenuationRadius = 400.f;
    FillLight->bUseInverseSquaredFalloff = false;

    AmbientFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("AmbientFX"));
    AmbientFX->SetupAttachment(Root);
    AmbientFX->bAutoActivate = false;

    FloorIndicator = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("FloorIndicator"));
    FloorIndicator->SetupAttachment(Root);
    FloorIndicator->SetRelativeLocation(FVector(0.f, 0.f, 1.f));
    FloorIndicator->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    FloorIndicator->SetCastShadow(false);
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void AZoneController::BeginPlay()
{
    Super::BeginPlay();

    Colors = bOverrideColors ? ColorOverride : FZoneColors::ForZone(ZoneId);

    // Build dynamic material for floor indicator
    if (FloorIndicator->GetMaterial(0))
    {
        FloorMID = FloorIndicator->CreateAndSetMaterialInstanceDynamic(0);
    }

    // Subscribe to event router
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &AZoneController::OnSwarmEventReceived);
        }
    }

    // Start dark, then fade to idle
    CurrentLightColor  = FLinearColor::Black;
    TargetLightColor   = FLinearColor::Black;
    CurrentKeyIntensity  = 0.f;
    CurrentFillIntensity = 0.f;
    TargetKeyIntensity   = 0.f;
    TargetFillIntensity  = 0.f;
    LerpAlpha            = 1.f;

    SetZoneState(EZoneState::Idle);
}

// ─── EndPlay ─────────────────────────────────────────────────────────────────

void AZoneController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(this, &AZoneController::OnSwarmEventReceived);
        }
    }

    Super::EndPlay(EndPlayReason);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void AZoneController::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    TickLightInterpolation(DeltaTime);
    TickPulse(DeltaTime);
}

// ─── SetZoneState ────────────────────────────────────────────────────────────

void AZoneController::SetZoneState(EZoneState NewState)
{
    if (NewState == CurrentState)
    {
        return;
    }

    PreviousState = CurrentState;
    CurrentState  = NewState;

    // Pull transition params (fallback to defaults if not configured)
    FZoneTransitionParams Params;
    if (const FZoneTransitionParams* Found = TransitionParams.Find(NewState))
    {
        Params = *Found;
    }
    LerpDuration = FMath::Max(Params.RampDuration, 0.016f);
    LerpAlpha    = 0.f;

    // Target light values
    TargetLightColor    = ColorForState(NewState, Colors);
    TargetKeyIntensity  = IntensityForState(NewState);
    TargetFillIntensity = TargetKeyIntensity * 0.35f; // fill at 35% of key

    // Pulse on Success or Retry
    StopPulse();
    if (NewState == EZoneState::Success)
    {
        StartPulse(Params.PulseFrequency, Params.PulseCount, FLinearColor(0.1f, 1.0f, 0.3f));
    }
    else if (NewState == EZoneState::Retry)
    {
        StartPulse(Params.PulseFrequency, Params.PulseCount, FLinearColor(1.0f, 0.55f, 0.0f));
    }

    // Niagara FX activation
    if (AmbientFX)
    {
        const bool bShouldFX = (NewState != EZoneState::Dark);
        if (bShouldFX && !AmbientFX->IsActive())
        {
            AmbientFX->Activate(true);
        }
        else if (!bShouldFX && AmbientFX->IsActive())
        {
            AmbientFX->Deactivate();
        }

        // Drive color parameter on Niagara system
        AmbientFX->SetColorParameter(TEXT("ZoneColor"), TargetLightColor);
    }

    ApplyStateToMPC(NewState, IntensityForState(NewState));
    ApplyStateToDynamicMaterial(NewState);

    // Broadcast delegate
    OnZoneStateChanged.Broadcast(ZoneId, NewState);
    BP_OnZoneStateEntered(NewState, PreviousState);
}

// ─── Event handler ───────────────────────────────────────────────────────────

void AZoneController::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    // Filter: if AgentId is set, only respond to events for that agent
    if (!AgentId.IsEmpty() && Event.AgentId != AgentId)
    {
        return;
    }

    BP_OnEventReceived(Event);

    EZoneState DesiredState = CurrentState;

    switch (Event.EventType)
    {
    case ESwarmEventType::SwarmStarted:
    case ESwarmEventType::AgentSpawn:
        DesiredState = EZoneState::Idle;
        break;

    case ESwarmEventType::AgentStepStarted:
    case ESwarmEventType::PipelineUpdate:
        DesiredState = EZoneState::Active;
        break;

    case ESwarmEventType::TaskHandoff:
        DesiredState = EZoneState::Handoff;
        break;

    case ESwarmEventType::AgentStepCompleted:
    case ESwarmEventType::TaskSuccess:
    case ESwarmEventType::SwarmCompleted:
        DesiredState = EZoneState::Success;
        break;

    case ESwarmEventType::AgentStepFailed:
    case ESwarmEventType::TaskFail:
    case ESwarmEventType::SwarmFailed:
    case ESwarmEventType::Anomaly:
        DesiredState = EZoneState::Failed;
        break;

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
        DesiredState = EZoneState::Retry;
        break;

    default:
        return; // No visual change for informational events
    }

    if (DesiredState != CurrentState)
    {
        SetZoneState(DesiredState);
    }
}

// ─── ApplyStateToLights ──────────────────────────────────────────────────────
// Called internally each tick via interpolation — does not set targets directly.

void AZoneController::ApplyStateToLights(EZoneState State)
{
    if (KeyLight)
    {
        KeyLight->SetLightColor(CurrentLightColor);
        KeyLight->SetIntensity(CurrentKeyIntensity);
    }
    if (FillLight)
    {
        FillLight->SetLightColor(CurrentLightColor);
        FillLight->SetIntensity(CurrentFillIntensity);
    }
}

// ─── ApplyStateToMPC ─────────────────────────────────────────────────────────

void AZoneController::ApplyStateToMPC(EZoneState State, float Intensity)
{
    if (!ZoneMPC || !GetWorld())
    {
        return;
    }

    const FLinearColor EmissiveColor = ColorForState(State, Colors);
    const float NormalizedIntensity  = FMath::Clamp(Intensity / 4000.f, 0.f, 1.f);

    if (!MPC_IntensityParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), ZoneMPC, MPC_IntensityParam, NormalizedIntensity);
    }
    if (!MPC_ColorParam.IsNone())
    {
        UKismetMaterialLibrary::SetVectorParameterValue(
            GetWorld(), ZoneMPC, MPC_ColorParam, EmissiveColor);
    }
    if (!MPC_AmbientParam.IsNone())
    {
        const float AmbientNorm = NormalizedIntensity * 0.4f;
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), ZoneMPC, MPC_AmbientParam, AmbientNorm);
    }
}

// ─── ApplyStateToDynamicMaterial ─────────────────────────────────────────────

void AZoneController::ApplyStateToDynamicMaterial(EZoneState State)
{
    if (!FloorMID)
    {
        return;
    }

    const FLinearColor EmissiveColor = ColorForState(State, Colors);
    const float Intensity = IntensityForState(State) / 4000.f;

    FloorMID->SetVectorParameterValue(TEXT("EmissiveColor"), EmissiveColor);
    FloorMID->SetScalarParameterValue(TEXT("EmissiveIntensity"), Intensity);
}

// ─── TickLightInterpolation ───────────────────────────────────────────────────

void AZoneController::TickLightInterpolation(float DeltaTime)
{
    if (LerpAlpha >= 1.f)
    {
        return;
    }

    LerpAlpha = FMath::Clamp(LerpAlpha + DeltaTime / LerpDuration, 0.f, 1.f);

    // Pull ease exponent from transition params if available
    float EaseExp = 2.f;
    if (const FZoneTransitionParams* Params = TransitionParams.Find(CurrentState))
    {
        EaseExp = Params->EaseExponent;
    }

    const float EasedAlpha = FMath::Pow(LerpAlpha, EaseExp);

    CurrentLightColor    = FLinearColor::LerpUsingHSV(
        CurrentLightColor, TargetLightColor, EasedAlpha);
    CurrentKeyIntensity  = FMath::Lerp(CurrentKeyIntensity,  TargetKeyIntensity,  EasedAlpha);
    CurrentFillIntensity = FMath::Lerp(CurrentFillIntensity, TargetFillIntensity, EasedAlpha);

    ApplyStateToLights(CurrentState);

    // Drive MPC with interpolated intensity during ramp
    const float InterpIntensity = CurrentKeyIntensity;
    if (ZoneMPC && !MPC_IntensityParam.IsNone() && GetWorld())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), ZoneMPC, MPC_IntensityParam,
            FMath::Clamp(InterpIntensity / 4000.f, 0.f, 1.f));
    }
}

// ─── Pulse system ─────────────────────────────────────────────────────────────

void AZoneController::StartPulse(float Frequency, int32 Count, FLinearColor InPulseColor)
{
    bPulsing         = true;
    PulsePhase       = 0.f;
    PulseFreq        = FMath::Max(Frequency, 0.1f);
    PulseBeatsLeft   = Count;
    PulseColor       = InPulseColor;
    PulseBaseIntensity = TargetKeyIntensity;
}

void AZoneController::StopPulse()
{
    bPulsing       = false;
    PulseBeatsLeft = -1;
}

void AZoneController::TickPulse(float DeltaTime)
{
    if (!bPulsing)
    {
        return;
    }

    PulsePhase += DeltaTime * PulseFreq * TWO_PI;

    // Count completed beats
    if (PulseBeatsLeft > 0)
    {
        const float CompletedBeats = PulsePhase / TWO_PI;
        const int32 BeatsCompleted = FMath::FloorToInt(CompletedBeats);
        if (BeatsCompleted >= PulseBeatsLeft)
        {
            StopPulse();
            return;
        }
    }

    const float PulseWave = 0.5f + 0.5f * FMath::Sin(PulsePhase);

    // Modulate between base intensity and 150% on positive beat
    const float PulsedIntensity = FMath::Lerp(PulseBaseIntensity * 0.6f,
                                               PulseBaseIntensity * 1.5f,
                                               PulseWave);
    const FLinearColor PulsedColor = FLinearColor::LerpUsingHSV(
        CurrentLightColor, PulseColor, PulseWave * 0.7f);

    if (KeyLight)
    {
        KeyLight->SetIntensity(PulsedIntensity);
        KeyLight->SetLightColor(PulsedColor);
    }
    if (FillLight)
    {
        FillLight->SetIntensity(PulsedIntensity * 0.35f);
        FillLight->SetLightColor(PulsedColor);
    }

    // Drive floor emissive with pulse
    if (FloorMID)
    {
        FloorMID->SetVectorParameterValue(TEXT("EmissiveColor"), PulsedColor);
        FloorMID->SetScalarParameterValue(TEXT("EmissiveIntensity"),
                                           FMath::Clamp(PulsedIntensity / 4000.f, 0.f, 1.5f));
    }
}
