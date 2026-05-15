#include "Agents/MetaAgentEntity.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "NiagaraFunctionLibrary.h"

AMetaAgentEntity::AMetaAgentEntity()
{
    PrimaryActorTick.bCanEverTick = true;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    HologramMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("HologramMesh"));
    HologramMesh->SetupAttachment(Root);
    HologramMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    HologramMesh->SetCastShadow(false);
    HologramMesh->SetVisibility(false); // starts invisible

    OrbitFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("OrbitFX"));
    OrbitFX->SetupAttachment(Root);
    OrbitFX->bAutoActivate = false;

    DataStreamFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("DataStreamFX"));
    DataStreamFX->SetupAttachment(Root);
    DataStreamFX->bAutoActivate = false;

    PulseFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("PulseFX"));
    PulseFX->SetupAttachment(Root);
    PulseFX->bAutoActivate = false;

    AmbientLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("AmbientLight"));
    AmbientLight->SetupAttachment(Root);
    AmbientLight->Intensity = 0.f;
    AmbientLight->AttenuationRadius = 500.f;
    AmbientLight->SetLightColor(FLinearColor(0.1f, 0.8f, 1.0f));
    AmbientLight->bUseInverseSquaredFalloff = false;

    CurrentEmissiveColor = BaseColor;
    TargetEmissiveColor  = BaseColor;
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void AMetaAgentEntity::BeginPlay()
{
    Super::BeginPlay();

    BaseLocation = GetActorLocation();
    HoverPhase   = FMath::RandRange(0.f, TWO_PI);

    if (HologramMesh->GetMaterial(0))
    {
        HologramMID = HologramMesh->CreateAndSetMaterialInstanceDynamic(0);
        if (HologramMID)
        {
            HologramMID->SetVectorParameterValue(TEXT("EmissiveColor"), BaseColor);
            HologramMID->SetScalarParameterValue(TEXT("Opacity"), 0.f);
        }
    }

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(
                this, &AMetaAgentEntity::OnSwarmEventReceived);
        }
    }
}

void AMetaAgentEntity::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &AMetaAgentEntity::OnSwarmEventReceived);
        }
    }
    Super::EndPlay(EndPlayReason);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void AMetaAgentEntity::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    TickMaterialize(DeltaTime);
    TickHover(DeltaTime);
    TickColorPulse(DeltaTime);
}

// ─── SetPresence ─────────────────────────────────────────────────────────────

void AMetaAgentEntity::SetPresence(EMetaAgentPresence NewPresence)
{
    if (NewPresence == CurrentPresence)
    {
        return;
    }

    PrevPresence    = CurrentPresence;
    CurrentPresence = NewPresence;

    switch (NewPresence)
    {
    case EMetaAgentPresence::Materializing:
        MaterializeDir = 1.f;
        HologramMesh->SetVisibility(true);
        break;

    case EMetaAgentPresence::Dissolving:
        MaterializeDir = -1.f;
        break;

    case EMetaAgentPresence::Dormant:
        MaterializeAlpha = 0.f;
        MaterializeDir   = 0.f;
        HologramMesh->SetVisibility(false);
        break;

    default:
        break;
    }

    ApplyPresenceToFX(NewPresence);
    OnPresenceChanged.Broadcast(NewPresence, PrevPresence);
    BP_OnPresenceChanged(NewPresence);
}

// ─── Event handler ───────────────────────────────────────────────────────────

void AMetaAgentEntity::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    switch (Event.EventType)
    {
    case ESwarmEventType::SwarmStarted:
        SetPresence(EMetaAgentPresence::Materializing);
        TargetEmissiveColor = BaseColor;
        break;

    case ESwarmEventType::SwarmCompleted:
    case ESwarmEventType::SwarmResult:
        TargetEmissiveColor = InsightColor;
        ColorPulseAlpha = 0.f;
        SetPresence(EMetaAgentPresence::Dissolving);
        break;

    case ESwarmEventType::SwarmFailed:
        TargetEmissiveColor = AlertColor;
        ColorPulseAlpha = 0.f;
        SetPresence(EMetaAgentPresence::AlertState);
        break;

    case ESwarmEventType::PlannerDecision:
        SetPresence(EMetaAgentPresence::Directing);
        TargetEmissiveColor = InsightColor;
        ColorPulseAlpha = 0.f;
        BP_OnPlannerDecision(Event);
        break;

    case ESwarmEventType::MetaInsight:
        TargetEmissiveColor = InsightColor;
        ColorPulseAlpha = 0.f;
        BP_OnMetaInsight(Event);
        break;

    case ESwarmEventType::Anomaly:
        SetPresence(EMetaAgentPresence::AlertState);
        TargetEmissiveColor = AlertColor;
        ColorPulseAlpha = 0.f;
        BP_OnAnomalyDetected(Event);
        break;

    default:
        break;
    }

    // Auto-advance from Materializing to Observing after MaterializeAlpha reaches 1
    if (CurrentPresence == EMetaAgentPresence::Materializing && MaterializeAlpha >= 0.98f)
    {
        SetPresence(EMetaAgentPresence::Observing);
    }
}

// ─── TickMaterialize ──────────────────────────────────────────────────────────

void AMetaAgentEntity::TickMaterialize(float DeltaTime)
{
    if (MaterializeDir == 0.f)
    {
        return;
    }

    const float Speed = (MaterializeDir > 0.f)
        ? (1.f / FMath::Max(MaterializeTime, 0.1f))
        : (1.f / FMath::Max(DissolveTime, 0.1f));

    MaterializeAlpha = FMath::Clamp(
        MaterializeAlpha + MaterializeDir * Speed * DeltaTime, 0.f, 1.f);

    if (HologramMID)
    {
        HologramMID->SetScalarParameterValue(TEXT("Opacity"), MaterializeAlpha);
        HologramMID->SetScalarParameterValue(TEXT("ScanlineFlicker"),
            FMath::Sin(MaterializeAlpha * 12.f) * (1.f - MaterializeAlpha) * 0.3f);
    }

    AmbientLight->SetIntensity(MaterializeAlpha * 1200.f);

    if (MaterializeAlpha >= 1.f && MaterializeDir > 0.f)
    {
        MaterializeDir = 0.f;
        if (CurrentPresence == EMetaAgentPresence::Materializing)
        {
            SetPresence(EMetaAgentPresence::Observing);
        }
    }
    else if (MaterializeAlpha <= 0.f && MaterializeDir < 0.f)
    {
        MaterializeDir = 0.f;
        HologramMesh->SetVisibility(false);
        if (OrbitFX->IsActive())    OrbitFX->Deactivate();
        if (DataStreamFX->IsActive()) DataStreamFX->Deactivate();
        if (PulseFX->IsActive())    PulseFX->Deactivate();
        SetPresence(EMetaAgentPresence::Dormant);
    }
}

// ─── TickHover ────────────────────────────────────────────────────────────────

void AMetaAgentEntity::TickHover(float DeltaTime)
{
    if (CurrentPresence == EMetaAgentPresence::Dormant)
    {
        return;
    }

    HoverPhase += DeltaTime * HoverFrequency * TWO_PI;
    const float HoverOffset = FMath::Sin(HoverPhase) * HoverAmplitude * MaterializeAlpha;
    SetActorLocation(BaseLocation + FVector(0.f, 0.f, HoverOffset));
}

// ─── TickColorPulse ───────────────────────────────────────────────────────────

void AMetaAgentEntity::TickColorPulse(float DeltaTime)
{
    if (FMath::IsNearlyEqual(ColorPulseAlpha, 1.f, 0.01f))
    {
        return;
    }

    ColorPulseAlpha = FMath::Clamp(ColorPulseAlpha + DeltaTime * 2.0f, 0.f, 1.f);
    CurrentEmissiveColor = FLinearColor::LerpUsingHSV(
        TargetEmissiveColor, BaseColor, ColorPulseAlpha);

    if (HologramMID)
    {
        HologramMID->SetVectorParameterValue(TEXT("EmissiveColor"), CurrentEmissiveColor);
    }
    AmbientLight->SetLightColor(CurrentEmissiveColor);
}

// ─── ApplyPresenceToFX ────────────────────────────────────────────────────────

void AMetaAgentEntity::ApplyPresenceToFX(EMetaAgentPresence Presence)
{
    switch (Presence)
    {
    case EMetaAgentPresence::Observing:
        if (!OrbitFX->IsActive())    OrbitFX->Activate(true);
        if (PulseFX->IsActive())     PulseFX->Deactivate();
        break;

    case EMetaAgentPresence::Directing:
        if (!OrbitFX->IsActive())     OrbitFX->Activate(true);
        if (!DataStreamFX->IsActive()) DataStreamFX->Activate(true);
        if (!PulseFX->IsActive())     PulseFX->Activate(true);
        break;

    case EMetaAgentPresence::AlertState:
        if (!PulseFX->IsActive())     PulseFX->Activate(true);
        PulseFX->SetColorParameter(TEXT("PulseColor"), AlertColor);
        break;

    case EMetaAgentPresence::Dormant:
        if (OrbitFX->IsActive())      OrbitFX->Deactivate();
        if (DataStreamFX->IsActive()) DataStreamFX->Deactivate();
        if (PulseFX->IsActive())      PulseFX->Deactivate();
        break;

    default:
        break;
    }
}
