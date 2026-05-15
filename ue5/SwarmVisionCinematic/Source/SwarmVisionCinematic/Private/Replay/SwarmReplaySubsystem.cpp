#include "Replay/SwarmReplaySubsystem.h"
#include "Events/SwarmEventRouterSubsystem.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HAL/PlatformTime.h"

static constexpr float TICK_RATE_HZ   = 30.f;
static constexpr float TICK_INTERVAL  = 1.f / TICK_RATE_HZ;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

void USwarmReplaySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
}

void USwarmReplaySubsystem::Deinitialize()
{
    Stop();
    Super::Deinitialize();
}

// ─── Load ─────────────────────────────────────────────────────────────────────

void USwarmReplaySubsystem::LoadReplayEvents(
    const TArray<FReplayEvent>&    Events,
    const TArray<FReplayBookmark>& InBookmarks,
    const FString&                 SwarmId,
    int64                          SwarmDurationMs)
{
    Stop();

    ReplayEvents    = Events;
    Bookmarks       = InBookmarks;
    CurrentSwarmId  = SwarmId;
    TotalDurationMs = SwarmDurationMs;
    EventCursor     = 0;
    CurrentOffsetMs = 0;
    LastBroadcastOffsetMs = -1;

    // Sort by offset ascending — relay service should already do this but ensure it
    ReplayEvents.Sort([](const FReplayEvent& A, const FReplayEvent& B)
    {
        return A.OffsetMs < B.OffsetMs;
    });

    Bookmarks.Sort([](const FReplayBookmark& A, const FReplayBookmark& B)
    {
        return A.OffsetMs < B.OffsetMs;
    });

    SetState(EReplayPlaybackState::Paused);
}

// ─── Playback control ─────────────────────────────────────────────────────────

void USwarmReplaySubsystem::Play()
{
    if (PlaybackState == EReplayPlaybackState::Idle ||
        ReplayEvents.IsEmpty()) return;

    if (PlaybackState == EReplayPlaybackState::Ended)
    {
        SeekToMs(0);
    }

    LastTickTime = FPlatformTime::Seconds();
    SetState(EReplayPlaybackState::Playing);

    UWorld* World = GetGameInstance()->GetWorld();
    if (World)
    {
        World->GetTimerManager().SetTimer(
            PlaybackTimer,
            this, &USwarmReplaySubsystem::TickPlayback,
            TICK_INTERVAL, true);
    }
}

void USwarmReplaySubsystem::Pause()
{
    if (PlaybackState != EReplayPlaybackState::Playing) return;

    UWorld* World = GetGameInstance()->GetWorld();
    if (World) World->GetTimerManager().ClearTimer(PlaybackTimer);

    SetState(EReplayPlaybackState::Paused);
}

void USwarmReplaySubsystem::Stop()
{
    UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
    if (World) World->GetTimerManager().ClearTimer(PlaybackTimer);

    CurrentOffsetMs = 0;
    EventCursor     = 0;
    SetState(EReplayPlaybackState::Idle);
}

void USwarmReplaySubsystem::SeekToMs(int64 OffsetMs)
{
    const bool bWasPlaying = (PlaybackState == EReplayPlaybackState::Playing);
    if (bWasPlaying) Pause();

    CurrentOffsetMs = FMath::Clamp(OffsetMs, (int64)0, TotalDurationMs);
    EventCursor     = FindEventIndexAtOffset(CurrentOffsetMs);

    SetState(EReplayPlaybackState::Scrubbing);
    OnPositionChanged.Broadcast(CurrentOffsetMs);
    SetState(EReplayPlaybackState::Paused);

    if (bWasPlaying) Play();
}

void USwarmReplaySubsystem::SeekToBookmark(const FString& BookmarkId)
{
    for (const FReplayBookmark& BM : Bookmarks)
    {
        if (BM.BookmarkId == BookmarkId)
        {
            SeekToMs(BM.OffsetMs);
            return;
        }
    }
}

void USwarmReplaySubsystem::SeekToNextBookmark()
{
    for (const FReplayBookmark& BM : Bookmarks)
    {
        if (BM.OffsetMs > CurrentOffsetMs)
        {
            SeekToMs(BM.OffsetMs);
            return;
        }
    }
}

void USwarmReplaySubsystem::SeekToPrevBookmark()
{
    for (int32 i = Bookmarks.Num() - 1; i >= 0; --i)
    {
        if (Bookmarks[i].OffsetMs < CurrentOffsetMs - 500)
        {
            SeekToMs(Bookmarks[i].OffsetMs);
            return;
        }
    }
    SeekToMs(0);
}

void USwarmReplaySubsystem::SetPlaybackRate(float Rate)
{
    PlaybackRate = FMath::Clamp(Rate, 0.1f, 16.f);
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void USwarmReplaySubsystem::TickPlayback()
{
    if (PlaybackState != EReplayPlaybackState::Playing) return;

    const double Now     = FPlatformTime::Seconds();
    const double Elapsed = Now - LastTickTime;
    LastTickTime         = Now;

    CurrentOffsetMs += static_cast<int64>(Elapsed * PlaybackRate * 1000.0);

    // Drain events up to current position
    while (EventCursor < ReplayEvents.Num() &&
           ReplayEvents[EventCursor].OffsetMs <= CurrentOffsetMs)
    {
        DispatchEvent(ReplayEvents[EventCursor]);
        ++EventCursor;
    }

    // Broadcast position at reduced frequency
    if (CurrentOffsetMs - LastBroadcastOffsetMs >= PositionBroadcastIntervalMs)
    {
        LastBroadcastOffsetMs = CurrentOffsetMs;
        OnPositionChanged.Broadcast(CurrentOffsetMs);
    }

    // End of replay
    if (EventCursor >= ReplayEvents.Num() && CurrentOffsetMs >= TotalDurationMs)
    {
        UWorld* World = GetGameInstance()->GetWorld();
        if (World) World->GetTimerManager().ClearTimer(PlaybackTimer);

        CurrentOffsetMs = TotalDurationMs;
        SetState(EReplayPlaybackState::Ended);
        OnPositionChanged.Broadcast(CurrentOffsetMs);
    }
}

// ─── Event dispatch ───────────────────────────────────────────────────────────

void USwarmReplaySubsystem::DispatchEvent(const FReplayEvent& Event)
{
    // Broadcast to Blueprint listeners
    OnReplayEvent.Broadcast(Event);

    // Re-inject into the existing event router so all live systems respond
    // (lighting, agents, camera director, atmosphere) — the router doesn't
    // distinguish replayed from live events; that's intentional.
    if (USwarmEventRouterSubsystem* Router =
        GetGameInstance()->GetSubsystem<USwarmEventRouterSubsystem>())
    {
        FSwarmEvent Evt;
        Evt.EventType = Event.EventType;
        Evt.AgentId   = Event.AgentId;
        Evt.SwarmId   = Event.SwarmId;
        Evt.DataJson  = Event.DataJson;
        Evt.Priority  = static_cast<EEventPriority>(
            FMath::Clamp(Event.Priority, 0, 4));
        Evt.TimestampMs = CurrentOffsetMs;

        Router->EnqueueEvent(Evt);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

void USwarmReplaySubsystem::SetState(EReplayPlaybackState NewState)
{
    if (PlaybackState == NewState) return;
    PlaybackState = NewState;
    OnPlaybackStateChanged.Broadcast(NewState);
}

int32 USwarmReplaySubsystem::FindEventIndexAtOffset(int64 OffsetMs) const
{
    // Binary search for first event at or after OffsetMs
    int32 Lo = 0, Hi = ReplayEvents.Num();
    while (Lo < Hi)
    {
        const int32 Mid = (Lo + Hi) / 2;
        if (ReplayEvents[Mid].OffsetMs < OffsetMs) Lo = Mid + 1;
        else Hi = Mid;
    }
    return Lo;
}
