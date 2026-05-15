#include "Intelligence/IntelligentCinematicDirector.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "FX/AtmosphereController.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

AIntelligentCinematicDirector::AIntelligentCinematicDirector()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AIntelligentCinematicDirector::BeginPlay()
{
    Super::BeginPlay();

    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        Intel->OnNarrativeStateUpdated.AddDynamic(
            this, &AIntelligentCinematicDirector::OnNarrativeStateUpdated);
        Intel->OnIncidentDetected.AddDynamic(
            this, &AIntelligentCinematicDirector::OnIncidentDetected);
    }
}

void AIntelligentCinematicDirector::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // Smooth tension for gradual atmosphere/lighting response
    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        const float TargetTension = Intel->GetTension();
        SmoothedTension = FMath::FInterpTo(
            SmoothedTension, TargetTension, DeltaTime, TensionBlendSpeed);
    }

    if (NarrativeOverrideCooldown > 0.f)
    {
        NarrativeOverrideCooldown -= DeltaTime;
    }
}

// ─── Narrative update ─────────────────────────────────────────────────────────

void AIntelligentCinematicDirector::OnNarrativeStateUpdated(const FNarrativeState& NewState)
{
    if (!bNarrativeModeEnabled) return;

    // Phase change → always fire BP hook and potentially recut
    if (NewState.Phase != PreviousPhase)
    {
        BP_OnNarrativePhaseChanged(NewState.Phase, NewState.Tension);
        PreviousPhase = NewState.Phase;
    }

    // Story beat change
    if (!NewState.StoryBeat.IsEmpty())
    {
        BP_OnStoryBeatChanged(NewState.StoryBeat);
    }

    // Tension jump → atmospheric response
    const float OldTension = LastTension;
    LastTension = NewState.Tension;
    if (FMath::Abs(NewState.Tension - OldTension) > 0.08f)
    {
        BP_OnTensionChanged(OldTension, NewState.Tension);
    }

    if (bDrivesAtmosphere)
    {
        SyncAtmosphere(NewState.Tension, NewState.Phase);
    }

    // Override current shot if tension warrants it and cooldown has expired
    if (NewState.Tension >= TensionOverrideThreshold &&
        NarrativeOverrideCooldown <= 0.f &&
        !NewState.RecommendedShots.IsEmpty())
    {
        ApplyNarrativeShot(NewState.RecommendedShots[0]);
        NarrativeOverrideCooldown = OVERRIDE_COOLDOWN_S;
    }

    // During low tension / epilogue: blend in the cinematic wide if not already running
    if (NewState.Tension < 0.2f &&
        NewState.Phase == ENarrativePhase::Epilogue &&
        NarrativeOverrideCooldown <= 0.f &&
        !NewState.RecommendedShots.IsEmpty())
    {
        // Find the lowest-focal wide shot from recommendations
        const FRecommendedShot* WideShot = nullptr;
        for (const auto& S : NewState.RecommendedShots)
        {
            if (!WideShot || S.FocalMM < WideShot->FocalMM) WideShot = &S;
        }
        if (WideShot) ApplyNarrativeShot(*WideShot);
        NarrativeOverrideCooldown = OVERRIDE_COOLDOWN_S * 2.f;
    }
}

void AIntelligentCinematicDirector::OnIncidentDetected(
    const FString& Kind, const FString& Description)
{
    UE_LOG(LogTemp, Warning, TEXT("[IntelDir] Incident detected: %s — %s"), *Kind, *Description);

    // Force immediate cut to crisis shot — skip cooldown for critical incidents
    if (USwarmIntelligenceSubsystem* Intel =
        GetGameInstance()->GetSubsystem<USwarmIntelligenceSubsystem>())
    {
        const FNarrativeState& State = Intel->GetNarrativeState();
        if (!State.RecommendedShots.IsEmpty())
        {
            ApplyNarrativeShot(State.RecommendedShots[0]);
            NarrativeOverrideCooldown = OVERRIDE_COOLDOWN_S;
        }
    }
}

// ─── Shot application ─────────────────────────────────────────────────────────

void AIntelligentCinematicDirector::ApplyNarrativeShot(const FRecommendedShot& Shot)
{
    FCinematicShotConfig Config;
    Config.FocalLength         = Shot.FocalMM;
    Config.Aperture            = Shot.Aperture;
    Config.DurationSeconds     = Shot.DurationS;
    Config.LookAtActor         = ResolveTargetActor(Shot.TargetActorId);
    Config.bDollyEnabled       = Shot.FocalMM <= 35.f;
    Config.EaseInFraction      = 0.2f;
    Config.EaseOutFraction     = 0.15f;

    PlayShot(Config);
}

void AIntelligentCinematicDirector::SyncAtmosphere(float Tension, ENarrativePhase Phase)
{
    AAtmosphereController* Atmosphere = Cast<AAtmosphereController>(
        UGameplayStatics::GetActorOfClass(GetWorld(), AAtmosphereController::StaticClass()));
    if (!Atmosphere) return;

    // Map tension → atmosphere anomaly intensity
    // Phase::Incident at high tension triggers near-instant atmosphere shift
    if (Phase == ENarrativePhase::Incident && Tension > 0.6f)
    {
        Atmosphere->SetAnomalyIntensity(Tension);
    }
    else
    {
        // Gentle fade back toward normal
        Atmosphere->SetAnomalyIntensity(SmoothedTension * 0.5f);
    }
}

AActor* AIntelligentCinematicDirector::ResolveTargetActor(const FString& ActorId) const
{
    if (ActorId.IsEmpty()) return nullptr;

    // Search all agents and zone actors by their registered id
    TArray<AActor*> Actors;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), AActor::StaticClass(), Actors);

    for (AActor* A : Actors)
    {
        // ASwarmAgentPawn exposes GetAgentId(); zones expose GetZoneId()
        if (A->GetName().Contains(ActorId) || A->Tags.Contains(FName(*ActorId)))
        {
            return A;
        }
    }
    return nullptr;
}
