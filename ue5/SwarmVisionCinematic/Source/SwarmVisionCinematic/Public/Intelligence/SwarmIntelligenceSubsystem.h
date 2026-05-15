#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/TimerHandle.h"
#include "SwarmIntelligenceSubsystem.generated.h"

// ─── Mirror of intelligence-service NarrativeState ───────────────────────────

UENUM(BlueprintType)
enum class ENarrativePhase : uint8
{
    Dormant         UMETA(DisplayName="Dormant"),
    Activation      UMETA(DisplayName="Activation"),
    Ramp            UMETA(DisplayName="Ramp"),
    PeakOperation   UMETA(DisplayName="PeakOperation"),
    Incident        UMETA(DisplayName="Incident"),
    Recovery        UMETA(DisplayName="Recovery"),
    Resolution      UMETA(DisplayName="Resolution"),
    Epilogue        UMETA(DisplayName="Epilogue"),
};

UENUM(BlueprintType)
enum class ENarrativePacing : uint8
{
    Slow    UMETA(DisplayName="Slow"),
    Medium  UMETA(DisplayName="Medium"),
    Fast    UMETA(DisplayName="Fast"),
    Urgent  UMETA(DisplayName="Urgent"),
};

USTRUCT(BlueprintType)
struct FRecommendedShot
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString ShotLabel;
    UPROPERTY(BlueprintReadOnly) float   FocalMM       = 50.f;
    UPROPERTY(BlueprintReadOnly) float   Aperture      = 2.0f;
    UPROPERTY(BlueprintReadOnly) FString TargetActorId;  // agent_id or zone_id; empty = free
    UPROPERTY(BlueprintReadOnly) float   DurationS     = 5.f;
    UPROPERTY(BlueprintReadOnly) int32   Priority      = 0;
};

USTRUCT(BlueprintType)
struct FNarrativeState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) ENarrativePhase   Phase     = ENarrativePhase::Dormant;
    UPROPERTY(BlueprintReadOnly) float             Tension   = 0.f;    // 0..1
    UPROPERTY(BlueprintReadOnly) ENarrativePacing  Pacing    = ENarrativePacing::Medium;
    UPROPERTY(BlueprintReadOnly) FString           FocusAgent;
    UPROPERTY(BlueprintReadOnly) FString           FocusZone;
    UPROPERTY(BlueprintReadOnly) FString           StoryBeat;
    UPROPERTY(BlueprintReadOnly) TArray<FRecommendedShot> RecommendedShots;
};

USTRUCT(BlueprintType)
struct FSwarmHealthSnapshot
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) float   OverallHealth           = 1.f;
    UPROPERTY(BlueprintReadOnly) float   OrchestrationEfficiency = 1.f;
    UPROPERTY(BlueprintReadOnly) float   AnomalySeverity         = 1.f;
    UPROPERTY(BlueprintReadOnly) float   RetryPressure           = 1.f;
    UPROPERTY(BlueprintReadOnly) float   ThroughputStability     = 1.f;
    UPROPERTY(BlueprintReadOnly) float   AgentBalance            = 1.f;
    UPROPERTY(BlueprintReadOnly) FString HealthLabel;     // healthy|degraded|critical|failed
    UPROPERTY(BlueprintReadOnly) FString HealthTrend;     // improving|stable|degrading|unknown
    UPROPERTY(BlueprintReadOnly) int32   ActiveBottlenecks = 0;
    UPROPERTY(BlueprintReadOnly) int32   ActiveIncidents   = 0;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnNarrativeStateUpdated, const FNarrativeState&, State);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnHealthUpdated,         const FSwarmHealthSnapshot&, Health);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnIncidentDetected,     FString, Kind, FString, Description);

// ─── USwarmIntelligenceSubsystem ──────────────────────────────────────────────
//
// Polls the intelligence-service REST API at configurable intervals.
// Parses NarrativeState and SwarmHealthReport from JSON.
// Broadcasts updates to ACinematicDirector, HUD, and atmosphere systems.

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmIntelligenceSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // Begin polling intelligence-service for this swarm
    UFUNCTION(BlueprintCallable, Category="Intelligence")
    void StartIntelligencePoll(const FString& SwarmId, const FString& ServiceUrl);

    UFUNCTION(BlueprintCallable, Category="Intelligence")
    void StopIntelligencePoll();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Intelligence")
    const FNarrativeState& GetNarrativeState()    const { return CurrentNarrative; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Intelligence")
    const FSwarmHealthSnapshot& GetHealthSnapshot() const { return CurrentHealth; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Intelligence")
    float GetTension() const { return CurrentNarrative.Tension; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Intelligence")
    ENarrativePhase GetPhase() const { return CurrentNarrative.Phase; }

    // ── Delegates ────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable) FOnNarrativeStateUpdated OnNarrativeStateUpdated;
    UPROPERTY(BlueprintAssignable) FOnHealthUpdated         OnHealthUpdated;
    UPROPERTY(BlueprintAssignable) FOnIncidentDetected      OnIncidentDetected;

    // ── Configurable poll interval ────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Intelligence")
    float PollIntervalSeconds = 2.0f;

private:
    void PollIntelligenceService();
    void ParseNarrativeResponse(const FString& JsonBody);
    void ParseHealthResponse(const FString& JsonBody);

    ENarrativePhase  PhaseFromString(const FString& S) const;
    ENarrativePacing PacingFromString(const FString& S) const;

    FTimerHandle     PollTimer;
    FString          ActiveSwarmId;
    FString          IntelligenceServiceUrl;

    FNarrativeState      CurrentNarrative;
    FSwarmHealthSnapshot CurrentHealth;

    // HTTP request — using UE5 HTTP module
    TSharedPtr<class IHttpRequest, ESPMode::ThreadSafe> ActiveRequest;
};
