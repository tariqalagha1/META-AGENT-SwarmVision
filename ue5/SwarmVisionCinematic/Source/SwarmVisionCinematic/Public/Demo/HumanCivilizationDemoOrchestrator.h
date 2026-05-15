#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Intelligence/SwarmIntelligenceSubsystem.h"
#include "Platform/SwarmPixelStreamingBridge.h"
#include "HumanCivilizationDemoOrchestrator.generated.h"

// ─── Phase 9 Demo — Reality Integration + Human–Civilization Coevolution ───────
//
// Beat 1  (0s)     — Command center boot: operators registered, safety constraints loaded
// Beat 2  (9s)     — Enterprise digital twin constructed: teams, infra, risk paths
// Beat 3  (18s)    — Human-AI governance council formed: executive + operators seated
// Beat 4  (27s)    — First governance request: swarm action submitted for approval
// Beat 5  (36s)    — Safety constraint fires: emergency_shutdown blocked, safe alternative issued
// Beat 6  (45s)    — Human operator reviews + approves action, consensus recorded
// Beat 7  (54s)    — Explainability report: causal chain rendered for approved action
// Beat 8  (63s)    — Constitutional moment: policy enacted, amendment proposed
// Beat 9  (72s)    — Crisis event: anomaly cascade triggers escalation to operator
// Beat 10 (81s)    — Human emergency intervention: operator override issued
// Beat 11 (90s)    — Trust report: intervention quality scored, calibration computed
// Beat 12 (99s)    — Mixed org restructuring: crisis committee convened with human+AI
// Beat 13 (108s)   — Enterprise twin updated: resilience recovered post-intervention
// Beat 14 (117s)   — Governance lineage published: audit trail complete
// Beat 15 (126s)   — Constitutional stability report: precedent set from intervention
// Beat 16 (135s)   — Command center green: human-AI civilization fully operational
//
// Total: ~135s

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API AHumanCivilizationDemoOrchestrator : public AActor
{
    GENERATED_BODY()

public:
    AHumanCivilizationDemoOrchestrator();
    virtual void BeginPlay() override;

    UFUNCTION(BlueprintCallable, Category="Demo") void StartDemo();
    UFUNCTION(BlueprintCallable, Category="Demo") void StopDemo();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    float GlobalTimeScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmAId = TEXT("swarm-alpha");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmBId = TEXT("swarm-beta");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString SwarmCId = TEXT("swarm-gamma");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString PrimaryOperatorId = TEXT("op-executive-01");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Demo")
    FString IntelligenceServiceUrl = TEXT("http://localhost:3004");

private:
    void ScheduleBeat(float DelayS, TFunction<void()> Fn);
    void FireEvents(const TArray<FString>& Specs, const FString& SwarmOverride = TEXT(""));
    void InjectEvent(const FString& Spec, const FString& SwarmOverride);
    void PushToViewer(const FString& Type, const FString& PayloadJson);

    // Phase 9 intelligence calls
    void RequestGovernanceApproval(const FString& SwarmId, const FString& ActionKind, const FString& Rationale);
    void RequestSafetyEvaluation(const FString& SwarmId, const FString& ProposedAction);
    void RequestExplainIntervention(const FString& SwarmId, const FString& ActionKind);
    void RequestTrustReport(const FString& SwarmId);
    void RequestEnterpriseTwin(const FString& SwarmId);
    void RequestMixedOrgs(const FString& SwarmId);
    void RequestCommandCenter(const FString& SwarmId);
    void RequestConstitutionalState(const FString& SwarmId);
    void PostOperatorIntervention(const FString& SwarmId, const FString& Kind, const FString& Target, const FString& Reason);
    void PostPolicy(const FString& SwarmId, const FString& Title, const FString& Body, const FString& Kind);

    void PostIntelligence(const FString& Endpoint, const FString& Body,
                          TFunction<void(const FString&)> OnResult);
    void GetIntelligence(const FString& Endpoint,
                         TFunction<void(const FString&)> OnResult);

    TArray<FTimerHandle> BeatTimers;
    bool bRunning = false;

    FString CachedEventPayload;
    FString PendingApprovalRequestId;
};
