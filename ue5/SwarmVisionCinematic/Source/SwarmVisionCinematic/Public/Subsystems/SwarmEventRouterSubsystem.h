#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Tickable.h"
#include "IWebSocket.h"
#include "Data/SwarmEvent.h"
#include "Data/SwarmEventTypes.h"
#include "SwarmEventRouterSubsystem.generated.h"

// ─── Delegate declarations ────────────────────────────────────────────────────
//
// Single multicast delegate for all event types. Subscribers filter by
// EventType themselves — avoids a separate delegate per event type (21 would
// be unmaintainable). Blueprint implementable via AddDynamic.

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(
    FOnSwarmEventReceived,
    const FSwarmEvent&, Event
);

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnAgentStateChanged,
    const FString&, AgentId,
    EAgentVisualState, NewState
);

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(
    FOnRelayConnectionChanged,
    bool, bConnected
);

// ─── Connection state ─────────────────────────────────────────────────────────

UENUM(BlueprintType)
enum class ERelayConnectionState : uint8
{
    Disconnected    UMETA(DisplayName="Disconnected"),
    Connecting      UMETA(DisplayName="Connecting"),
    Connected       UMETA(DisplayName="Connected"),
    Degraded        UMETA(DisplayName="Degraded"),   // connected but receiving errors
    Reconnecting    UMETA(DisplayName="Reconnecting"),
};

// ─── USwarmEventRouterSubsystem ───────────────────────────────────────────────
//
// GameInstance subsystem — lives for the entire process lifetime.
// Owns the WebSocket connection to the event-relay service (:9000).
// Parses Ue5Message JSON → FSwarmEvent.
// Maintains a priority queue, dispatches events on game thread each tick.
// Maintains per-agent state map (FAgentStateRecord).
// All Blueprint actors subscribe via OnSwarmEventReceived delegate.

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmEventRouterSubsystem
    : public UGameInstanceSubsystem
    , public FTickableGameObject
{
    GENERATED_BODY()

public:
    // ── USubsystem interface ─────────────────────────────────────────────────

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // ── FTickableGameObject interface ────────────────────────────────────────

    virtual void Tick(float DeltaTime) override;
    virtual bool IsTickable() const override { return true; }
    virtual bool IsTickableInEditor() const override { return false; }
    virtual TStatId GetStatId() const override;

    // ── Blueprint-accessible delegates ──────────────────────────────────────

    // Fired for every dispatched event — all subscribers receive all events
    UPROPERTY(BlueprintAssignable, Category="SwarmVision|Events")
    FOnSwarmEventReceived OnSwarmEventReceived;

    // Fired when a specific agent's visual state changes
    UPROPERTY(BlueprintAssignable, Category="SwarmVision|Agents")
    FOnAgentStateChanged OnAgentStateChanged;

    // Fired when the relay WebSocket connects or disconnects
    UPROPERTY(BlueprintAssignable, Category="SwarmVision|Connection")
    FOnRelayConnectionChanged OnRelayConnectionChanged;

    // ── Blueprint-callable API ───────────────────────────────────────────────

    // Returns current connection state
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="SwarmVision|Connection")
    ERelayConnectionState GetConnectionState() const { return ConnectionState; }

    // Returns true if WebSocket is fully connected
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="SwarmVision|Connection")
    bool IsConnected() const { return ConnectionState == ERelayConnectionState::Connected; }

    // Returns agent state record (returns default record if agent unknown)
    UFUNCTION(BlueprintCallable, Category="SwarmVision|Agents")
    FAgentStateRecord GetAgentState(const FString& AgentId) const;

    // Returns all known agent state records
    UFUNCTION(BlueprintCallable, Category="SwarmVision|Agents")
    TArray<FAgentStateRecord> GetAllAgentStates() const;

    // Returns the total number of events processed since startup
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="SwarmVision|Stats")
    int64 GetTotalEventsProcessed() const { return TotalEventsProcessed; }

    // Returns the current depth of the priority queue
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="SwarmVision|Stats")
    int32 GetQueueDepth() const { return EventQueue.Num(); }

    // Manually inject a raw JSON string as if it arrived from the relay.
    // Used by test actors and the replay system.
    UFUNCTION(BlueprintCallable, Category="SwarmVision|Testing")
    void InjectRawJson(const FString& RawJson, bool bMarkAsReplay = false);

    // Clears the event queue (useful before replay injection)
    UFUNCTION(BlueprintCallable, Category="SwarmVision|Testing")
    void FlushQueue();

    // Force reconnect attempt (Blueprint-callable)
    UFUNCTION(BlueprintCallable, Category="SwarmVision|Connection")
    void Reconnect();

    // ── Configuration (set before Initialize or via CDO) ─────────────────────

    // Relay WebSocket URL — default reads SWARM_RELAY_URL env var, else ws://localhost:9000
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmVision|Config")
    FString RelayUrl = TEXT("ws://localhost:9000");

    // Reconnect delay in seconds after a drop
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmVision|Config")
    float ReconnectDelaySeconds = 3.0f;

    // Max events to dequeue per tick per priority band:
    //   [Critical, High, Normal, Low, Ambient]
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="SwarmVision|Config")
    TArray<int32> MaxDispatchPerTickByPriority = {4, 3, 2, 1, 1};

private:
    // ── WebSocket ────────────────────────────────────────────────────────────

    TSharedPtr<IWebSocket> WebSocket;
    ERelayConnectionState ConnectionState = ERelayConnectionState::Disconnected;

    void ConnectWebSocket();
    void DisconnectWebSocket();

    // WebSocket event handlers
    void OnWebSocketConnected();
    void OnWebSocketConnectionError(const FString& Error);
    void OnWebSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean);
    void OnWebSocketMessage(const FString& Message);

    // ── Reconnect timer ───────────────────────────────────────────────────────

    FTimerHandle ReconnectTimerHandle;
    void ScheduleReconnect();
    void OnReconnectTimer();

    // ── Priority queue ────────────────────────────────────────────────────────
    // Thread-safe: raw messages are pushed from the WebSocket receive thread
    // via a lock-guarded pending list, then bulk-moved to EventQueue on the
    // game thread at the start of each Tick.

    FCriticalSection PendingLock;
    TArray<FSwarmEvent> PendingEvents;   // written from WS thread, drained each tick

    TArray<FQueuedEvent> EventQueue;     // game-thread only — sorted priority queue
    uint64 NextSequenceNumber = 0;

    void DrainPendingToQueue();
    void DispatchFromQueue(float DeltaTime);
    void EnqueueEvent(FSwarmEvent&& Event);
    void DispatchEvent(const FSwarmEvent& Event);

    // ── JSON parsing ─────────────────────────────────────────────────────────

    static bool ParseUe5Message(const FString& RawJson, FSwarmEvent& OutEvent, bool bIsReplay);
    static ESwarmEventType ParseEventType(const FString& TypeString);
    static ERelayChannel ParseChannel(const FString& ChannelString);
    static EEventPriority AssignPriority(ESwarmEventType EventType);

    // Flatten the "data" JSON object into OutEvent.Data (FString→FString map)
    static void FlattenDataObject(
        const TSharedPtr<class FJsonObject>& DataObj,
        TMap<FString, FString>& OutData
    );

    // ── Agent state machine ───────────────────────────────────────────────────

    TMap<FString, FAgentStateRecord> AgentStates;

    void UpdateAgentState(const FSwarmEvent& Event);
    void SetAgentVisualState(const FString& AgentId, EAgentVisualState NewState,
                             const FSwarmEvent& TriggerEvent);

    // ── Stats ─────────────────────────────────────────────────────────────────

    int64 TotalEventsProcessed = 0;
    int64 TotalEventsDropped   = 0;

    // ── Logging ───────────────────────────────────────────────────────────────

    static void LogEvent(const FSwarmEvent& Event);
};
