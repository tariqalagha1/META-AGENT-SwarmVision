#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "SwarmTestInjector.generated.h"

// ─── ASwarmTestInjector ───────────────────────────────────────────────────────
//
// Development actor. Place one in the level.
// Provides Blueprint-callable functions to inject synthetic events into the
// subsystem without requiring the full backend stack to be running.
// Also subscribes to OnSwarmEventReceived and prints each event to screen.
//
// In production builds this actor should not be placed.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmTestInjector : public AActor
{
    GENERATED_BODY()

public:
    ASwarmTestInjector();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    // ── Blueprint test helpers ────────────────────────────────────────────────

    // Fire the full 60-second demo sequence as injected events (time-compressed)
    UFUNCTION(BlueprintCallable, CallInEditor, Category="SwarmTest")
    void RunDemoSequence();

    // Inject a single named event for the given agent
    UFUNCTION(BlueprintCallable, CallInEditor, Category="SwarmTest")
    void InjectEvent(const FString& EventType, const FString& AgentId = TEXT(""));

    // Inject a raw Ue5Message JSON string
    UFUNCTION(BlueprintCallable, Category="SwarmTest")
    void InjectRawJson(const FString& Json);

    // Print current agent states to output log and screen
    UFUNCTION(BlueprintCallable, CallInEditor, Category="SwarmTest")
    void PrintAgentStates();

    // ── Config ────────────────────────────────────────────────────────────────

    // How long between demo sequence events (seconds, compressed for testing)
    UPROPERTY(EditAnywhere, Category="SwarmTest")
    float DemoEventIntervalSeconds = 1.0f;

    // Whether to print received events to screen (on-screen debug text)
    UPROPERTY(EditAnywhere, Category="SwarmTest")
    bool bPrintEventsToScreen = true;

    UPROPERTY(EditAnywhere, Category="SwarmTest")
    float ScreenMessageDuration = 4.0f;

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    UFUNCTION()
    void OnAgentStateChanged(const FString& AgentId, EAgentVisualState NewState);

    // Builds a minimal valid Ue5Message JSON for a given event type
    static FString BuildTestMessage(
        const FString& EventType,
        const FString& AgentId,
        const FString& TraceId,
        const TMap<FString, FString>& ExtraData = {}
    );

    // Demo sequence timer
    TArray<FString> DemoEventQueue;
    FTimerHandle DemoTimerHandle;
    FString DemoTraceId;

    UFUNCTION()
    void FireNextDemoEvent();

    int32 DemoScreenKey = 12000;
};
