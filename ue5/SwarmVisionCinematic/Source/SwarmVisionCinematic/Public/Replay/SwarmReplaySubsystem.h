#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/TimerHandle.h"
#include "Events/SwarmEventTypes.h"
#include "SwarmReplaySubsystem.generated.h"

UENUM(BlueprintType)
enum class EReplayPlaybackState : uint8
{
    Idle       UMETA(DisplayName="Idle"),
    Playing    UMETA(DisplayName="Playing"),
    Paused     UMETA(DisplayName="Paused"),
    Scrubbing  UMETA(DisplayName="Scrubbing"),
    Ended      UMETA(DisplayName="Ended"),
};

USTRUCT(BlueprintType)
struct FReplayEvent
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString   EventId;
    UPROPERTY(BlueprintReadOnly) FString   SwarmId;
    UPROPERTY(BlueprintReadOnly) FString   EventType;
    UPROPERTY(BlueprintReadOnly) FString   AgentId;
    UPROPERTY(BlueprintReadOnly) int64     OffsetMs   = 0;   // from swarm start
    UPROPERTY(BlueprintReadOnly) int32     Priority   = 2;
    UPROPERTY(BlueprintReadOnly) FString   DataJson;
};

USTRUCT(BlueprintType)
struct FReplayBookmark
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString BookmarkId;
    UPROPERTY(BlueprintReadOnly) int64   OffsetMs  = 0;
    UPROPERTY(BlueprintReadOnly) FString Label;
    UPROPERTY(BlueprintReadOnly) FString Type;   // anomaly|failure|retry|success|manual
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnReplayEvent,        const FReplayEvent&, Event);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnReplayStateChanged, EReplayPlaybackState, NewState);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnReplayPosition,     int64,               OffsetMs);

// ─── USwarmReplaySubsystem ────────────────────────────────────────────────────
//
// Drives UE5-side replay playback from events fetched from the replay-service.
// Sends events into the existing USwarmEventRouterSubsystem at playback_rate.
// Supports: play, pause, seek, rate control, bookmark jump, loop.

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmReplaySubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    // ── Subsystem lifecycle ──────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ── Load replay data ─────────────────────────────────────────────────────

    // Called after replay session + events are fetched from replay-service REST API
    UFUNCTION(BlueprintCallable, Category="Replay")
    void LoadReplayEvents(const TArray<FReplayEvent>& Events,
                          const TArray<FReplayBookmark>& Bookmarks,
                          const FString& SwarmId,
                          int64 SwarmDurationMs);

    // ── Playback control ─────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="Replay") void Play();
    UFUNCTION(BlueprintCallable, Category="Replay") void Pause();
    UFUNCTION(BlueprintCallable, Category="Replay") void Stop();
    UFUNCTION(BlueprintCallable, Category="Replay") void SeekToMs(int64 OffsetMs);
    UFUNCTION(BlueprintCallable, Category="Replay") void SeekToBookmark(const FString& BookmarkId);
    UFUNCTION(BlueprintCallable, Category="Replay") void SeekToNextBookmark();
    UFUNCTION(BlueprintCallable, Category="Replay") void SeekToPrevBookmark();

    UFUNCTION(BlueprintCallable, Category="Replay")
    void SetPlaybackRate(float Rate);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    EReplayPlaybackState GetPlaybackState() const { return PlaybackState; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    int64 GetCurrentOffsetMs() const { return CurrentOffsetMs; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    int64 GetDurationMs() const { return TotalDurationMs; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    float GetProgress() const
    {
        return TotalDurationMs > 0
            ? FMath::Clamp(static_cast<float>(CurrentOffsetMs) / static_cast<float>(TotalDurationMs), 0.f, 1.f)
            : 0.f;
    }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    float GetPlaybackRate() const { return PlaybackRate; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Replay")
    const TArray<FReplayBookmark>& GetBookmarks() const { return Bookmarks; }

    // ── Delegates ────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="Replay")
    FOnReplayEvent        OnReplayEvent;

    UPROPERTY(BlueprintAssignable, Category="Replay")
    FOnReplayStateChanged OnPlaybackStateChanged;

    UPROPERTY(BlueprintAssignable, Category="Replay")
    FOnReplayPosition     OnPositionChanged;

private:
    void TickPlayback();
    void SetState(EReplayPlaybackState NewState);
    void DispatchEvent(const FReplayEvent& Event);
    int32 FindEventIndexAtOffset(int64 OffsetMs) const;

    TArray<FReplayEvent>    ReplayEvents;
    TArray<FReplayBookmark> Bookmarks;

    EReplayPlaybackState PlaybackState   = EReplayPlaybackState::Idle;
    int64  CurrentOffsetMs               = 0;
    int64  TotalDurationMs               = 0;
    int32  EventCursor                   = 0;
    float  PlaybackRate                  = 1.f;
    FString CurrentSwarmId;

    double LastTickTime                  = 0.0;   // FPlatformTime::Seconds()

    FTimerHandle PlaybackTimer;

    // Position broadcast — only fire when position crosses 250ms boundary
    int64  LastBroadcastOffsetMs         = -1;
    static constexpr int64 PositionBroadcastIntervalMs = 250;
};
