#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Platform/ViewerModeController.h"
#include "Platform/SwarmPerformanceTierManager.h"
#include "SwarmPixelStreamingBridge.generated.h"

// Inbound message from viewer browser via Pixel Streaming data channel
USTRUCT(BlueprintType)
struct FPixelStreamingMessage
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString Type;       // "mode_switch", "replay_control", "tier_set", etc.
    UPROPERTY(BlueprintReadOnly) FString Payload;    // JSON
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(
    FOnPixelStreamingMessage, const FPixelStreamingMessage&, Message);

// ─── USwarmPixelStreamingBridge ───────────────────────────────────────────────
//
// Bridges the Pixel Streaming data channel to SwarmVision subsystems.
// All bidirectional communication between the viewer browser and UE5 goes
// through this class, keeping all other systems decoupled from PS.

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmPixelStreamingBridge : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ── Send to viewer browser ────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="PixelStreaming")
    void SendToViewer(const FString& Type, const FString& PayloadJson);

    UFUNCTION(BlueprintCallable, Category="PixelStreaming")
    void BroadcastSwarmState(const FString& SwarmId, const FString& StateJson);

    UFUNCTION(BlueprintCallable, Category="PixelStreaming")
    void BroadcastReplayPosition(int64 OffsetMs, float Progress);

    UFUNCTION(BlueprintCallable, Category="PixelStreaming")
    void BroadcastViewerMode(EViewerMode Mode);

    UFUNCTION(BlueprintCallable, Category="PixelStreaming")
    void BroadcastQualityScore(float Score, const FString& SwarmId);

    // ── Receive from viewer browser ───────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="PixelStreaming")
    FOnPixelStreamingMessage OnMessageReceived;

private:
    void OnDataChannelMessage(const FString& JsonMessage);
    void DispatchMessage(const FPixelStreamingMessage& Msg);
    void HandleModeSwitch(const FString& Payload);
    void HandleReplayControl(const FString& Payload);
    void HandleTierSet(const FString& Payload);

    // Pixel Streaming plugin delegate handle
    FDelegateHandle DataChannelHandle;
};
