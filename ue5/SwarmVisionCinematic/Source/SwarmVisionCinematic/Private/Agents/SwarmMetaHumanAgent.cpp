#include "Agents/SwarmMetaHumanAgent.h"
#include "Components/SkeletalMeshComponent.h"
#include "NiagaraComponent.h"
#include "Engine/World.h"
#include "Math/UnrealMathUtility.h"

ASwarmMetaHumanAgent::ASwarmMetaHumanAgent()
{
    PrimaryActorTick.bCanEverTick = true;

    // Body — parent to root (from ASwarmAgentPawn's root component)
    BodyMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("BodyMesh"));
    BodyMesh->SetupAttachment(GetRootComponent());
    BodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Face — attached to body head socket (socket name: "head" on MetaHuman skeleton)
    FaceMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("FaceMesh"));
    FaceMesh->SetupAttachment(BodyMesh, TEXT("head"));
    FaceMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // Hair — USceneComponent base; BP subclass attaches UGroomComponent here
    HairComponent = CreateDefaultSubobject<USceneComponent>(TEXT("HairRoot"));
    HairComponent->SetupAttachment(FaceMesh, TEXT("FACIAL_C_ForeheadMid"));

    // Status beacon above head
    StatusBeacon = CreateDefaultSubobject<UNiagaraComponent>(TEXT("StatusBeacon"));
    StatusBeacon->SetupAttachment(GetRootComponent());
    StatusBeacon->SetRelativeLocation(FVector(0.f, 0.f, 200.f));
    StatusBeacon->bAutoActivate = false;

    // Disable the placeholder mesh from ASwarmAgentPawn
    // (BodyMesh is the MetaHuman replacement)
    if (Mesh)
    {
        Mesh->SetVisibility(false);
        Mesh->DestroyComponent();
    }
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::BeginPlay()
{
    Super::BeginPlay();

    // Seed randomness for non-repetitive idle variation per agent
    const FString& Aid = GetAgentId();
    const uint32 Seed  = GetTypeHash(Aid);
    FMath::RandInit(Seed);

    NextShiftInterval      = FMath::RandRange(3.f, 8.f);
    BreathingPhase         = FMath::RandRange(0.f, TWO_PI);
    IdleShiftPhase         = FMath::RandRange(0.f, TWO_PI);
    SaccadePhase           = FMath::RandRange(0.f, TWO_PI);
    IdleExpressionTimer    = FMath::RandRange(2.f, IdleExpressionShiftInterval);

    // Start gaze at workstation
    if (WorkstationActor)
    {
        TargetGazePosition   = WorkstationActor->GetActorLocation();
        SmoothedGazePosition = TargetGazePosition;
    }
    else
    {
        TargetGazePosition = GetActorLocation() + GetActorForwardVector() * 150.f +
                             FVector(0.f, 0.f, 170.f);
        SmoothedGazePosition = TargetGazePosition;
    }
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    TickBreathing(DeltaTime);
    TickGaze(DeltaTime);
    TickIdleShift(DeltaTime);
    TickExpressionBlend(DeltaTime);
    TickWorkstationIK(DeltaTime);
}

// ─── Expression ──────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::SetExpression(EAgentExpression NewExpression, float BlendOverride)
{
    if (TargetExpression == NewExpression)
    {
        return;
    }

    TargetExpression = NewExpression;
    ExpressionAlpha  = 0.f;

    BP_OnExpressionChanged(NewExpression);
}

void ASwarmMetaHumanAgent::TickExpressionBlend(float DeltaTime)
{
    // Auto-advance expression during idle
    if (GetAnimState() == EAgentAnimState::Idle ||
        GetAnimState() == EAgentAnimState::Working)
    {
        IdleExpressionTimer -= DeltaTime;
        if (IdleExpressionTimer <= 0.f)
        {
            IdleExpressionTimer = FMath::RandRange(
                IdleExpressionShiftInterval * 0.5f, IdleExpressionShiftInterval * 1.5f);

            // Transition expression to match current anim state
            const EAgentExpression AutoExpr = ExpressionForAnimState(GetAnimState());
            SetExpression(AutoExpr);
        }
    }

    // Blend alpha toward 1
    if (ExpressionAlpha < 1.f)
    {
        ExpressionAlpha = FMath::Clamp(
            ExpressionAlpha + DeltaTime * ExpressionBlendSpeed, 0.f, 1.f);
    }

    CurrentExpression = TargetExpression;
}

// ─── Gaze ─────────────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::SetGazeTarget(EGazeTarget Target, AActor* OptionalActor)
{
    CurrentGazeTarget = Target;

    if (OptionalActor)
    {
        TargetGazePosition = OptionalActor->GetActorLocation() + FVector(0.f, 0.f, 160.f);
    }
    else
    {
        switch (Target)
        {
        case EGazeTarget::Workstation:
            TargetGazePosition = WorkstationActor
                ? (WorkstationActor->GetActorLocation() + FVector(0.f, 0.f, 100.f))
                : (GetActorLocation() + GetActorForwardVector() * 150.f + FVector(0.f, 0.f, 170.f));
            break;

        case EGazeTarget::Corridor:
            // Look toward corridor center — offset forward from current position
            TargetGazePosition = GetActorLocation() + GetActorForwardVector() * 400.f +
                                 FVector(0.f, 0.f, 165.f);
            break;

        case EGazeTarget::Ambient:
            // Allow TickGaze to handle saccade variation
            break;

        default:
            break;
        }
    }

    BP_OnGazeTargetChanged(Target, TargetGazePosition);
}

void ASwarmMetaHumanAgent::TickGaze(float DeltaTime)
{
    // Saccade micro-movement during ambient/idle gaze
    if (CurrentGazeTarget == EGazeTarget::Ambient ||
        GetAnimState() == EAgentAnimState::Idle)
    {
        SaccadePhase += DeltaTime * SaccadeFrequency * TWO_PI;
        const float SaccX = FMath::Sin(SaccadePhase * 1.3f) * SaccadeAmplitude;
        const float SaccY = FMath::Cos(SaccadePhase * 0.7f) * SaccadeAmplitude;
        const FVector SaccadeOffset(SaccX, SaccY, 0.f);
        SmoothedGazePosition = FMath::VInterpTo(
            SmoothedGazePosition,
            TargetGazePosition + SaccadeOffset,
            DeltaTime, GazeLerpSpeed);
    }
    else
    {
        SmoothedGazePosition = FMath::VInterpTo(
            SmoothedGazePosition, TargetGazePosition, DeltaTime, GazeLerpSpeed);
    }
}

// ─── Breathing ───────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::TickBreathing(float DeltaTime)
{
    // Breathing rate increases slightly during Working/Retry states
    const EAgentAnimState State = GetAnimState();
    float TargetFreq = 0.22f; // ~13 bpm — calm
    float TargetAmp  = 0.55f;

    if (State == EAgentAnimState::Working)
    {
        TargetFreq = 0.28f; // ~17 bpm — focused
        TargetAmp  = 0.75f;
    }
    else if (State == EAgentAnimState::Retry)
    {
        TargetFreq = 0.33f;
        TargetAmp  = 0.85f;
    }
    else if (State == EAgentAnimState::Failed)
    {
        TargetFreq = 0.30f;
        TargetAmp  = 0.80f;
    }

    BreathingFrequency = FMath::FInterpTo(BreathingFrequency, TargetFreq, DeltaTime, 0.5f);
    BreathingPhase    += DeltaTime * BreathingFrequency * TWO_PI;
    BreathingAmplitude = FMath::FInterpTo(BreathingAmplitude, TargetAmp, DeltaTime, 1.0f);
}

// ─── Idle shift ──────────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::TickIdleShift(float DeltaTime)
{
    IdleShiftTimer -= DeltaTime;
    if (IdleShiftTimer <= 0.f)
    {
        IdleShiftTimer    = NextShiftInterval;
        NextShiftInterval = FMath::RandRange(4.f, 10.f);
        IdleShiftPhase    = FMath::RandRange(0.f, TWO_PI);
    }

    const float ShiftTarget = (GetAnimState() == EAgentAnimState::Idle) ? 1.f : 0.3f;
    IdleShiftWeight = FMath::FInterpTo(IdleShiftWeight, ShiftTarget, DeltaTime, 1.5f);
}

// ─── Workstation IK ──────────────────────────────────────────────────────────

void ASwarmMetaHumanAgent::TickWorkstationIK(float DeltaTime)
{
    const EAgentAnimState State = GetAnimState();
    TargetIKAlpha = (State == EAgentAnimState::Working) ? 1.f : 0.f;
    WorkstationIKAlpha = FMath::FInterpTo(WorkstationIKAlpha, TargetIKAlpha,
                                           DeltaTime, IKBlendSpeed);
}

// ─── IAgentAnimDataProvider — morph weights ───────────────────────────────────

float ASwarmMetaHumanAgent::GetBrowConcernWeight_Implementation() const
{
    const EAgentAnimState S = GetAnimState();
    if (S == EAgentAnimState::Failed)  return 0.85f * ExpressionAlpha;
    if (S == EAgentAnimState::Retry)   return 0.5f  * ExpressionAlpha;
    if (S == EAgentAnimState::Working) return 0.2f  * ExpressionAlpha;
    return 0.f;
}

float ASwarmMetaHumanAgent::GetBrowFocusWeight_Implementation() const
{
    const EAgentAnimState S = GetAnimState();
    if (S == EAgentAnimState::Working)  return 0.75f * ExpressionAlpha;
    if (S == EAgentAnimState::Handoff)  return 0.5f  * ExpressionAlpha;
    if (S == EAgentAnimState::Retry)    return 0.6f  * ExpressionAlpha;
    return 0.f;
}

float ASwarmMetaHumanAgent::GetLipPressWeight_Implementation() const
{
    const EAgentAnimState S = GetAnimState();
    if (S == EAgentAnimState::Failed)   return 0.6f * ExpressionAlpha;
    if (S == EAgentAnimState::Working)  return 0.25f * ExpressionAlpha;
    return 0.f;
}

float ASwarmMetaHumanAgent::GetJawRelaxWeight_Implementation() const
{
    const EAgentAnimState S = GetAnimState();
    if (S == EAgentAnimState::Complete) return 0.7f * ExpressionAlpha;
    if (S == EAgentAnimState::Idle)     return 0.4f;
    return 0.f;
}

// ─── State → Expression / Gaze mappings ──────────────────────────────────────

EAgentExpression ASwarmMetaHumanAgent::ExpressionForAnimState(EAgentAnimState State) const
{
    switch (State)
    {
    case EAgentAnimState::Idle:      return EAgentExpression::Observing;
    case EAgentAnimState::Working:   return EAgentExpression::Focused;
    case EAgentAnimState::Handoff:   return EAgentExpression::Anticipating;
    case EAgentAnimState::Failed:    return EAgentExpression::Concerned;
    case EAgentAnimState::Retry:     return EAgentExpression::Processing;
    case EAgentAnimState::Complete:  return EAgentExpression::Resolved;
    default:                         return EAgentExpression::Neutral;
    }
}

EGazeTarget ASwarmMetaHumanAgent::GazeForAnimState(EAgentAnimState State) const
{
    switch (State)
    {
    case EAgentAnimState::Idle:      return EGazeTarget::Ambient;
    case EAgentAnimState::Working:   return EGazeTarget::Workstation;
    case EAgentAnimState::Handoff:   return EGazeTarget::DataStream;
    case EAgentAnimState::Failed:    return EGazeTarget::HoloDisplay;
    case EAgentAnimState::Retry:     return EGazeTarget::Workstation;
    case EAgentAnimState::Complete:  return EGazeTarget::Corridor;
    default:                         return EGazeTarget::Workstation;
    }
}
