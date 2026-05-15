#include "Lighting/LightOrchestrator.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Environment/ZoneController.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Materials/MaterialParameterCollection.h"
#include "Engine/SkyLight.h"
#include "Engine/DirectionalLight.h"
#include "Components/SkyLightComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "EngineUtils.h"

ALightOrchestrator::ALightOrchestrator()
{
    PrimaryActorTick.bCanEverTick = true;

    CinematicPP = CreateDefaultSubobject<UPostProcessComponent>(TEXT("CinematicPP"));
    CinematicPP->SetupAttachment(GetRootComponent());
    CinematicPP->bUnbound  = true;
    CinematicPP->Priority  = 10; // above other volumes
    CinematicPP->BlendWeight = 1.f;

    BuildDefaultCinematicStates();

    // Pre-configure default global states
    State_PreSwarm.AmbientColor         = FLinearColor(0.01f, 0.01f, 0.02f);
    State_PreSwarm.SkyLightIntensity    = 0.1f;
    State_PreSwarm.DirectionalIntensity = 0.2f;
    State_PreSwarm.PostProcessExposure  = 0.8f;
    State_PreSwarm.TransitionDuration   = 2.0f;

    State_SwarmActive.AmbientColor         = FLinearColor(0.03f, 0.03f, 0.06f);
    State_SwarmActive.SkyLightIntensity    = 0.4f;
    State_SwarmActive.DirectionalIntensity = 0.6f;
    State_SwarmActive.PostProcessExposure  = 1.0f;
    State_SwarmActive.TransitionDuration   = 1.5f;

    State_SwarmComplete.AmbientColor         = FLinearColor(0.04f, 0.07f, 0.04f);
    State_SwarmComplete.SkyLightIntensity    = 0.6f;
    State_SwarmComplete.DirectionalIntensity = 0.8f;
    State_SwarmComplete.PostProcessExposure  = 1.1f;
    State_SwarmComplete.TransitionDuration   = 2.5f;

    State_Anomaly.AmbientColor         = FLinearColor(0.06f, 0.01f, 0.01f);
    State_Anomaly.SkyLightIntensity    = 0.15f;
    State_Anomaly.DirectionalIntensity = 0.3f;
    State_Anomaly.PostProcessExposure  = 0.9f;
    State_Anomaly.TransitionDuration   = 0.2f; // fast cut

    State_SwarmFailed.AmbientColor         = FLinearColor(0.04f, 0.0f, 0.0f);
    State_SwarmFailed.SkyLightIntensity    = 0.08f;
    State_SwarmFailed.DirectionalIntensity = 0.15f;
    State_SwarmFailed.PostProcessExposure  = 0.75f;
    State_SwarmFailed.TransitionDuration   = 0.8f;
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void ALightOrchestrator::BeginPlay()
{
    Super::BeginPlay();

    CurrentGlobalState = State_PreSwarm;
    TargetGlobalState  = State_PreSwarm;
    GlobalLerpAlpha    = 1.f;

    ApplyGlobalStateDirect(State_PreSwarm);

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &ALightOrchestrator::OnSwarmEventReceived);
        }
    }
}

// ─── EndPlay ─────────────────────────────────────────────────────────────────

void ALightOrchestrator::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(this, &ALightOrchestrator::OnSwarmEventReceived);
        }
    }
    Super::EndPlay(EndPlayReason);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void ALightOrchestrator::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    TickGlobalInterpolation(DeltaTime);
    TickAlertPulse(DeltaTime);
    TickCinematicInterpolation(DeltaTime);

    // Smooth corridor flow intensity
    if (!FMath::IsNearlyEqual(CorridorFlowCurrent, CorridorFlowTarget, 0.001f))
    {
        CorridorFlowCurrent = FMath::FInterpTo(CorridorFlowCurrent, CorridorFlowTarget,
                                                DeltaTime, 2.f);
        if (GlobalMPC && GetWorld() && !MPC_CorridorFlowParam.IsNone())
        {
            UKismetMaterialLibrary::SetScalarParameterValue(
                GetWorld(), GlobalMPC, MPC_CorridorFlowParam, CorridorFlowCurrent);
        }
    }
}

// ─── Event handler ───────────────────────────────────────────────────────────

void ALightOrchestrator::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    switch (Event.EventType)
    {
    case ESwarmEventType::SwarmStarted:
        TransitionToGlobalState(State_SwarmActive);
        TransitionToCinematicState(Cinematic_Active);
        BroadcastZoneState(EZoneState::Idle);
        SetCorridorFlowIntensity(0.5f);
        break;

    case ESwarmEventType::AgentStepStarted:
        TransitionToCinematicState(Cinematic_Active);
        break;

    case ESwarmEventType::TaskHandoff:
        TransitionToCinematicState(Cinematic_Handoff);
        SetCorridorFlowIntensity(FMath::Min(CorridorFlowTarget + 0.15f, 1.f));
        break;

    case ESwarmEventType::TaskSuccess:
        TransitionToCinematicState(Cinematic_Success);
        break;

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
        TransitionToCinematicState(Cinematic_Retry);
        break;

    case ESwarmEventType::SwarmCompleted:
    case ESwarmEventType::SwarmResult:
        TransitionToGlobalState(State_SwarmComplete);
        TransitionToCinematicState(Cinematic_Complete);
        BroadcastZoneState(EZoneState::Success);
        SetCorridorFlowIntensity(1.0f);
        break;

    case ESwarmEventType::SwarmFailed:
        TransitionToGlobalState(State_SwarmFailed);
        TransitionToCinematicState(Cinematic_Failed);
        BroadcastZoneState(EZoneState::Failed);
        SetCorridorFlowIntensity(0.1f);
        TriggerGlobalAlert(FLinearColor(1.f, 0.05f, 0.05f), AlertPulseFrequency, AlertPulseCount);
        break;

    case ESwarmEventType::AgentStepFailed:
        TransitionToCinematicState(Cinematic_Failed);
        break;

    case ESwarmEventType::Anomaly:
        TransitionToGlobalState(State_Anomaly);
        TransitionToCinematicState(Cinematic_Anomaly);
        TriggerGlobalAlert(FLinearColor(1.f, 0.0f, 0.0f), AlertPulseFrequency, AlertPulseCount);
        break;

    case ESwarmEventType::MetricsSnapshot:
    {
        // Adjust global ambient based on quality score if present
        const float QScore = Event.GetDataFloat(TEXT("quality_score"), -1.f);
        if (QScore >= 0.f)
        {
            const float NormScore = FMath::Clamp(QScore / 100.f, 0.f, 1.f);
            if (GlobalMPC && GetWorld() && !MPC_GlobalAmbientParam.IsNone())
            {
                UKismetMaterialLibrary::SetScalarParameterValue(
                    GetWorld(), GlobalMPC, MPC_GlobalAmbientParam,
                    FMath::Lerp(0.1f, 0.6f, NormScore));
            }
        }
        break;
    }

    default:
        break;
    }
}

// ─── TransitionToGlobalState ─────────────────────────────────────────────────

void ALightOrchestrator::TransitionToGlobalState(const FGlobalLightState& InTargetState)
{
    TargetGlobalState  = InTargetState;
    GlobalLerpDuration = FMath::Max(InTargetState.TransitionDuration, 0.016f);
    GlobalLerpAlpha    = 0.f;

    BP_OnGlobalStateChanged(InTargetState);
}

// ─── TriggerGlobalAlert ───────────────────────────────────────────────────────

void ALightOrchestrator::TriggerGlobalAlert(FLinearColor InAlertColor,
                                             float Frequency, int32 Count)
{
    bAlerting      = true;
    AlertPhase     = 0.f;
    AlertFreq      = FMath::Max(Frequency, 0.1f);
    AlertBeatsLeft = Count;
    AlertColor     = InAlertColor;

    BP_OnAlertTriggered(InAlertColor);
}

// ─── SetCorridorFlowIntensity ─────────────────────────────────────────────────

void ALightOrchestrator::SetCorridorFlowIntensity(float Intensity)
{
    CorridorFlowTarget = FMath::Clamp(Intensity, 0.f, 1.f);
}

// ─── BroadcastZoneState ───────────────────────────────────────────────────────

void ALightOrchestrator::BroadcastZoneState(EZoneState State)
{
    for (AZoneController* Zone : GetAllZoneControllers())
    {
        if (Zone)
        {
            Zone->SetZoneState(State);
        }
    }
}

// ─── TickGlobalInterpolation ──────────────────────────────────────────────────

void ALightOrchestrator::TickGlobalInterpolation(float DeltaTime)
{
    if (GlobalLerpAlpha >= 1.f)
    {
        return;
    }

    GlobalLerpAlpha = FMath::Clamp(GlobalLerpAlpha + DeltaTime / GlobalLerpDuration, 0.f, 1.f);
    const float Alpha = FMath::SmoothStep(0.f, 1.f, GlobalLerpAlpha);

    FGlobalLightState Interpolated;
    Interpolated.AmbientColor = FLinearColor::LerpUsingHSV(
        CurrentGlobalState.AmbientColor, TargetGlobalState.AmbientColor, Alpha);
    Interpolated.SkyLightIntensity = FMath::Lerp(
        CurrentGlobalState.SkyLightIntensity, TargetGlobalState.SkyLightIntensity, Alpha);
    Interpolated.DirectionalIntensity = FMath::Lerp(
        CurrentGlobalState.DirectionalIntensity, TargetGlobalState.DirectionalIntensity, Alpha);

    // Apply to scene lights
    if (SceneSkyLight && SceneSkyLight->GetLightComponent())
    {
        SceneSkyLight->GetLightComponent()->SetIntensity(Interpolated.SkyLightIntensity);
        SceneSkyLight->GetLightComponent()->SetLightColor(Interpolated.AmbientColor);
    }

    if (SceneDirectionalLight)
    {
        if (UDirectionalLightComponent* DLC = SceneDirectionalLight->
                FindComponentByClass<UDirectionalLightComponent>())
        {
            DLC->SetIntensity(Interpolated.DirectionalIntensity);
        }
    }

    // Drive global ambient MPC
    if (GlobalMPC && GetWorld() && !MPC_GlobalAmbientParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), GlobalMPC, MPC_GlobalAmbientParam, Interpolated.SkyLightIntensity);
    }

    if (GlobalLerpAlpha >= 1.f)
    {
        CurrentGlobalState = TargetGlobalState;
    }
}

// ─── TickAlertPulse ───────────────────────────────────────────────────────────

void ALightOrchestrator::TickAlertPulse(float DeltaTime)
{
    if (!bAlerting)
    {
        return;
    }

    AlertPhase += DeltaTime * AlertFreq * TWO_PI;

    if (AlertBeatsLeft > 0)
    {
        const int32 Completed = FMath::FloorToInt(AlertPhase / TWO_PI);
        if (Completed >= AlertBeatsLeft)
        {
            bAlerting = false;
            // Zero out alert MPC
            if (GlobalMPC && GetWorld())
            {
                if (!MPC_AlertIntensityParam.IsNone())
                {
                    UKismetMaterialLibrary::SetScalarParameterValue(
                        GetWorld(), GlobalMPC, MPC_AlertIntensityParam, 0.f);
                }
            }
            return;
        }
    }

    const float Wave = 0.5f + 0.5f * FMath::Sin(AlertPhase);

    if (GlobalMPC && GetWorld())
    {
        if (!MPC_AlertColorParam.IsNone())
        {
            UKismetMaterialLibrary::SetVectorParameterValue(
                GetWorld(), GlobalMPC, MPC_AlertColorParam, AlertColor);
        }
        if (!MPC_AlertIntensityParam.IsNone())
        {
            UKismetMaterialLibrary::SetScalarParameterValue(
                GetWorld(), GlobalMPC, MPC_AlertIntensityParam, Wave);
        }
    }
}

// ─── ApplyGlobalStateDirect ──────────────────────────────────────────────────

void ALightOrchestrator::ApplyGlobalStateDirect(const FGlobalLightState& State)
{
    if (SceneSkyLight && SceneSkyLight->GetLightComponent())
    {
        SceneSkyLight->GetLightComponent()->SetIntensity(State.SkyLightIntensity);
        SceneSkyLight->GetLightComponent()->SetLightColor(State.AmbientColor);
    }

    if (GlobalMPC && GetWorld() && !MPC_GlobalAmbientParam.IsNone())
    {
        UKismetMaterialLibrary::SetScalarParameterValue(
            GetWorld(), GlobalMPC, MPC_GlobalAmbientParam, State.SkyLightIntensity);
    }
}

// ─── GetAllZoneControllers ────────────────────────────────────────────────────

TArray<AZoneController*> ALightOrchestrator::GetAllZoneControllers() const
{
    TArray<AZoneController*> Result;
    if (!GetWorld())
    {
        return Result;
    }
    for (TActorIterator<AZoneController> It(GetWorld()); It; ++It)
    {
        Result.Add(*It);
    }
    return Result;
}

// ─── Phase 3: Cinematic lighting ─────────────────────────────────────────────

void ALightOrchestrator::BuildDefaultCinematicStates()
{
    // Dormant — deep midnight blue, minimal contrast, low saturation
    Cinematic_Dormant.AmbientColor           = FLinearColor(0.01f, 0.01f, 0.02f);
    Cinematic_Dormant.SkyLightIntensity      = 0.08f;
    Cinematic_Dormant.DirectionalIntensity   = 0.15f;
    Cinematic_Dormant.LumenGIIntensity       = 0.4f;
    Cinematic_Dormant.LumenReflectionIntensity = 0.6f;
    Cinematic_Dormant.ExposureCompensation   = -0.5f;
    Cinematic_Dormant.ContrastShadows        = 0.4f;
    Cinematic_Dormant.ContrastHighlights     = 0.6f;
    Cinematic_Dormant.ColorSaturation        = 0.7f;
    Cinematic_Dormant.ColorGradeShadows      = FLinearColor(0.90f, 0.93f, 1.00f);
    Cinematic_Dormant.ColorGradeMidtones     = FLinearColor(0.95f, 0.97f, 1.00f);
    Cinematic_Dormant.CorridorFlowIntensity  = 0.0f;
    Cinematic_Dormant.TransitionDuration     = 3.0f;

    // Active — cool blue-white, raised GI, full saturation
    Cinematic_Active.AmbientColor            = FLinearColor(0.03f, 0.03f, 0.06f);
    Cinematic_Active.SkyLightIntensity       = 0.4f;
    Cinematic_Active.DirectionalIntensity    = 0.6f;
    Cinematic_Active.LumenGIIntensity        = 1.0f;
    Cinematic_Active.LumenReflectionIntensity = 1.2f;
    Cinematic_Active.ExposureCompensation    = 0.0f;
    Cinematic_Active.ContrastShadows         = 0.5f;
    Cinematic_Active.ContrastHighlights      = 0.55f;
    Cinematic_Active.ColorSaturation         = 1.1f;
    Cinematic_Active.ColorGradeShadows       = FLinearColor(0.88f, 0.92f, 1.00f);
    Cinematic_Active.ColorGradeMidtones      = FLinearColor(1.00f, 1.00f, 1.00f);
    Cinematic_Active.CorridorFlowIntensity   = 0.5f;
    Cinematic_Active.CorridorFlowColor       = FLinearColor(0.0f, 0.9f, 0.85f);
    Cinematic_Active.TransitionDuration      = 1.5f;

    // Handoff — slightly warmer cyan, elevated GI for inter-zone feel
    Cinematic_Handoff.AmbientColor           = FLinearColor(0.02f, 0.04f, 0.06f);
    Cinematic_Handoff.SkyLightIntensity      = 0.5f;
    Cinematic_Handoff.LumenGIIntensity       = 1.2f;
    Cinematic_Handoff.LumenReflectionIntensity = 1.5f;
    Cinematic_Handoff.ColorSaturation        = 1.2f;
    Cinematic_Handoff.CorridorFlowIntensity  = 0.9f;
    Cinematic_Handoff.CorridorFlowColor      = FLinearColor(0.0f, 0.95f, 0.9f);
    Cinematic_Handoff.TransitionDuration     = 0.8f;

    // Success — warm green bloom, max saturation, open exposure
    Cinematic_Success.AmbientColor           = FLinearColor(0.02f, 0.05f, 0.03f);
    Cinematic_Success.SkyLightIntensity      = 0.65f;
    Cinematic_Success.DirectionalIntensity   = 0.8f;
    Cinematic_Success.LumenGIIntensity       = 1.4f;
    Cinematic_Success.LumenReflectionIntensity = 1.6f;
    Cinematic_Success.ExposureCompensation   = 0.4f;
    Cinematic_Success.ContrastShadows        = 0.55f;
    Cinematic_Success.ContrastHighlights     = 0.45f;
    Cinematic_Success.ColorSaturation        = 1.3f;
    Cinematic_Success.ColorGradeMidtones     = FLinearColor(0.96f, 1.02f, 0.96f);
    Cinematic_Success.ColorGradeHighlights   = FLinearColor(0.94f, 1.04f, 0.94f);
    Cinematic_Success.CorridorFlowIntensity  = 1.0f;
    Cinematic_Success.CorridorFlowColor      = FLinearColor(0.1f, 1.0f, 0.4f);
    Cinematic_Success.TransitionDuration     = 2.5f;

    // Failed — desaturated, deep red shadows, crushed blacks
    Cinematic_Failed.AmbientColor            = FLinearColor(0.04f, 0.01f, 0.01f);
    Cinematic_Failed.SkyLightIntensity       = 0.1f;
    Cinematic_Failed.DirectionalIntensity    = 0.2f;
    Cinematic_Failed.LumenGIIntensity        = 0.5f;
    Cinematic_Failed.LumenReflectionIntensity = 0.4f;
    Cinematic_Failed.ExposureCompensation    = -0.8f;
    Cinematic_Failed.ContrastShadows         = 0.35f;
    Cinematic_Failed.ContrastHighlights      = 0.65f;
    Cinematic_Failed.ColorSaturation         = 0.6f;
    Cinematic_Failed.ColorGradeShadows       = FLinearColor(1.05f, 0.90f, 0.88f);
    Cinematic_Failed.ColorGradeMidtones      = FLinearColor(1.02f, 0.95f, 0.94f);
    Cinematic_Failed.CorridorFlowIntensity   = 0.1f;
    Cinematic_Failed.CorridorFlowColor       = FLinearColor(0.5f, 0.05f, 0.05f);
    Cinematic_Failed.TransitionDuration      = 0.6f;

    // Retry — amber tension, moderate saturation, slightly lifted shadows
    Cinematic_Retry.AmbientColor             = FLinearColor(0.04f, 0.03f, 0.01f);
    Cinematic_Retry.SkyLightIntensity        = 0.3f;
    Cinematic_Retry.LumenGIIntensity         = 0.9f;
    Cinematic_Retry.ExposureCompensation     = -0.2f;
    Cinematic_Retry.ColorSaturation          = 0.95f;
    Cinematic_Retry.ColorGradeShadows        = FLinearColor(1.02f, 0.98f, 0.90f);
    Cinematic_Retry.ColorGradeMidtones       = FLinearColor(1.01f, 0.99f, 0.94f);
    Cinematic_Retry.CorridorFlowIntensity    = 0.4f;
    Cinematic_Retry.CorridorFlowColor        = FLinearColor(1.0f, 0.55f, 0.0f);
    Cinematic_Retry.TransitionDuration       = 0.9f;

    // Anomaly — red emergency, max contrast, crushed + blown
    Cinematic_Anomaly.AmbientColor           = FLinearColor(0.08f, 0.01f, 0.01f);
    Cinematic_Anomaly.SkyLightIntensity      = 0.12f;
    Cinematic_Anomaly.DirectionalIntensity   = 0.25f;
    Cinematic_Anomaly.LumenGIIntensity       = 0.6f;
    Cinematic_Anomaly.LumenReflectionIntensity = 0.5f;
    Cinematic_Anomaly.ExposureCompensation   = -1.0f;
    Cinematic_Anomaly.ContrastShadows        = 0.25f;
    Cinematic_Anomaly.ContrastHighlights     = 0.75f;
    Cinematic_Anomaly.ColorSaturation        = 0.5f;
    Cinematic_Anomaly.ColorGradeShadows      = FLinearColor(1.10f, 0.85f, 0.85f);
    Cinematic_Anomaly.ColorGradeMidtones     = FLinearColor(1.05f, 0.90f, 0.90f);
    Cinematic_Anomaly.CorridorFlowIntensity  = 0.05f;
    Cinematic_Anomaly.CorridorFlowColor      = FLinearColor(1.0f, 0.0f, 0.0f);
    Cinematic_Anomaly.TransitionDuration     = 0.12f; // near-instant

    // Complete — cinematic wide open, warm triumphant
    Cinematic_Complete.AmbientColor          = FLinearColor(0.03f, 0.04f, 0.06f);
    Cinematic_Complete.SkyLightIntensity     = 0.7f;
    Cinematic_Complete.DirectionalIntensity  = 0.9f;
    Cinematic_Complete.LumenGIIntensity      = 1.5f;
    Cinematic_Complete.LumenReflectionIntensity = 1.8f;
    Cinematic_Complete.ExposureCompensation  = 0.6f;
    Cinematic_Complete.ContrastShadows       = 0.58f;
    Cinematic_Complete.ContrastHighlights    = 0.42f;
    Cinematic_Complete.ColorSaturation       = 1.25f;
    Cinematic_Complete.ColorGradeShadows     = FLinearColor(0.90f, 0.93f, 1.00f);
    Cinematic_Complete.ColorGradeMidtones    = FLinearColor(1.00f, 1.01f, 1.02f);
    Cinematic_Complete.ColorGradeHighlights  = FLinearColor(1.02f, 1.04f, 1.06f);
    Cinematic_Complete.CorridorFlowIntensity = 1.0f;
    Cinematic_Complete.CorridorFlowColor     = FLinearColor(0.2f, 1.0f, 0.6f);
    Cinematic_Complete.TransitionDuration    = 3.0f;

    CurrentCinematicState = Cinematic_Dormant;
    TargetCinematicState  = Cinematic_Dormant;
}

void ALightOrchestrator::TransitionToCinematicState(const FCinematicLightingState& State)
{
    TargetCinematicState  = State;
    CinematicLerpDuration = FMath::Max(State.TransitionDuration, 0.016f);
    CinematicLerpAlpha    = 0.f;
    BP_OnCinematicStateChanged(State);
}

void ALightOrchestrator::TickCinematicInterpolation(float DeltaTime)
{
    if (CinematicLerpAlpha >= 1.f) return;

    CinematicLerpAlpha = FMath::Clamp(
        CinematicLerpAlpha + DeltaTime / CinematicLerpDuration, 0.f, 1.f);

    const float EaseExp = FMath::Lerp(TargetCinematicState.EaseExponent,
                                       CurrentCinematicState.EaseExponent, 0.5f);
    const float Alpha = FMath::Pow(CinematicLerpAlpha, EaseExp);

    FCinematicLightingState I;
    I.SkyLightIntensity       = FMath::Lerp(CurrentCinematicState.SkyLightIntensity,
                                              TargetCinematicState.SkyLightIntensity, Alpha);
    I.AmbientColor            = FLinearColor::LerpUsingHSV(
                                    CurrentCinematicState.AmbientColor,
                                    TargetCinematicState.AmbientColor, Alpha);
    I.DirectionalIntensity    = FMath::Lerp(CurrentCinematicState.DirectionalIntensity,
                                              TargetCinematicState.DirectionalIntensity, Alpha);
    I.ExposureCompensation    = FMath::Lerp(CurrentCinematicState.ExposureCompensation,
                                              TargetCinematicState.ExposureCompensation, Alpha);
    I.ContrastShadows         = FMath::Lerp(CurrentCinematicState.ContrastShadows,
                                              TargetCinematicState.ContrastShadows, Alpha);
    I.ContrastHighlights      = FMath::Lerp(CurrentCinematicState.ContrastHighlights,
                                              TargetCinematicState.ContrastHighlights, Alpha);
    I.ColorSaturation         = FMath::Lerp(CurrentCinematicState.ColorSaturation,
                                              TargetCinematicState.ColorSaturation, Alpha);
    I.ColorGradeShadows       = FLinearColor::LerpUsingHSV(
                                    CurrentCinematicState.ColorGradeShadows,
                                    TargetCinematicState.ColorGradeShadows, Alpha);
    I.ColorGradeMidtones      = FLinearColor::LerpUsingHSV(
                                    CurrentCinematicState.ColorGradeMidtones,
                                    TargetCinematicState.ColorGradeMidtones, Alpha);
    I.ColorGradeHighlights    = FLinearColor::LerpUsingHSV(
                                    CurrentCinematicState.ColorGradeHighlights,
                                    TargetCinematicState.ColorGradeHighlights, Alpha);
    I.LumenGIIntensity        = FMath::Lerp(CurrentCinematicState.LumenGIIntensity,
                                              TargetCinematicState.LumenGIIntensity, Alpha);
    I.LumenReflectionIntensity = FMath::Lerp(CurrentCinematicState.LumenReflectionIntensity,
                                               TargetCinematicState.LumenReflectionIntensity, Alpha);
    I.CorridorFlowIntensity   = FMath::Lerp(CurrentCinematicState.CorridorFlowIntensity,
                                              TargetCinematicState.CorridorFlowIntensity, Alpha);
    I.CorridorFlowColor       = FLinearColor::LerpUsingHSV(
                                    CurrentCinematicState.CorridorFlowColor,
                                    TargetCinematicState.CorridorFlowColor, Alpha);

    ApplyCinematicStateDirect(I);

    if (CinematicLerpAlpha >= 1.f)
    {
        CurrentCinematicState = TargetCinematicState;
    }
}

void ALightOrchestrator::ApplyCinematicStateDirect(const FCinematicLightingState& State)
{
    // Sky light
    if (SceneSkyLight && SceneSkyLight->GetLightComponent())
    {
        SceneSkyLight->GetLightComponent()->SetIntensity(State.SkyLightIntensity);
        SceneSkyLight->GetLightComponent()->SetLightColor(State.AmbientColor);
    }

    // Directional light
    if (SceneDirectionalLight)
    {
        if (UDirectionalLightComponent* DLC =
                SceneDirectionalLight->FindComponentByClass<UDirectionalLightComponent>())
        {
            DLC->SetIntensity(State.DirectionalIntensity);
            DLC->SetLightColor(State.DirectionalColor);
        }
    }

    // Post-process color grading + exposure
    if (CinematicPP)
    {
        FPostProcessSettings& PP = CinematicPP->Settings;

        PP.bOverride_AutoExposureBias          = true;
        PP.AutoExposureBias                    = State.ExposureCompensation;

        PP.bOverride_ColorGamma                = true;
        PP.ColorGamma = FVector4(State.ContrastShadows,
                                  State.ContrastShadows,
                                  State.ContrastShadows, 1.f);

        PP.bOverride_ColorContrast             = true;
        PP.ColorContrast = FVector4(State.ContrastHighlights,
                                     State.ContrastHighlights,
                                     State.ContrastHighlights, 1.f);

        PP.bOverride_ColorSaturation           = true;
        PP.ColorSaturation = FVector4(State.ColorSaturation,
                                       State.ColorSaturation,
                                       State.ColorSaturation, 1.f);

        PP.bOverride_ColorGradingLUT           = false;

        // Lumen
        PP.bOverride_DynamicGlobalIlluminationMethod = false; // set in project settings
        PP.bOverride_LumenSceneLightingQuality  = true;
        PP.LumenSceneLightingQuality            = FMath::Clamp(State.LumenGIIntensity, 0.f, 4.f);
        PP.bOverride_LumenFinalGatherQuality    = true;
        PP.LumenFinalGatherQuality              = FMath::Clamp(State.LumenReflectionIntensity, 0.f, 4.f);
    }

    // Corridor flow via MPC
    if (GlobalMPC && GetWorld())
    {
        if (!MPC_CorridorFlowParam.IsNone())
        {
            UKismetMaterialLibrary::SetScalarParameterValue(
                GetWorld(), GlobalMPC, MPC_CorridorFlowParam, State.CorridorFlowIntensity);
        }
        if (!MPC_CorridorColorParam.IsNone())
        {
            UKismetMaterialLibrary::SetVectorParameterValue(
                GetWorld(), GlobalMPC, MPC_CorridorColorParam, State.CorridorFlowColor);
        }
    }
}
