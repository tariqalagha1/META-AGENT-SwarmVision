#include "Subsystems/SwarmEventRouterSubsystem.h"

#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/DateTime.h"
#include "Misc/App.h"
#include "Algo/Sort.h"

DEFINE_LOG_CATEGORY_STATIC(LogSwarmRelay, Log, All);

// ─── Static lookup tables ─────────────────────────────────────────────────────

static const TMap<FString, ESwarmEventType>& GetEventTypeMap()
{
    static const TMap<FString, ESwarmEventType> Map = {
        { TEXT("SWARM_STARTED"),         ESwarmEventType::SwarmStarted        },
        { TEXT("SWARM_COMPLETED"),       ESwarmEventType::SwarmCompleted      },
        { TEXT("SWARM_FAILED"),          ESwarmEventType::SwarmFailed         },
        { TEXT("SWARM_RESULT"),          ESwarmEventType::SwarmResult         },
        { TEXT("PLANNER_DECISION"),      ESwarmEventType::PlannerDecision     },
        { TEXT("AGENT_STEP_STARTED"),    ESwarmEventType::AgentStepStarted    },
        { TEXT("AGENT_STEP_COMPLETED"),  ESwarmEventType::AgentStepCompleted  },
        { TEXT("AGENT_STEP_FAILED"),     ESwarmEventType::AgentStepFailed     },
        { TEXT("AGENT_STEP_RETRY"),      ESwarmEventType::AgentStepRetry      },
        { TEXT("RETRY"),                 ESwarmEventType::Retry               },
        { TEXT("METRICS_SNAPSHOT"),      ESwarmEventType::MetricsSnapshot     },
        { TEXT("AGENT_STATE_SNAPSHOT"),  ESwarmEventType::AgentStateSnapshot  },
        { TEXT("META_INSIGHT"),          ESwarmEventType::MetaInsight         },
        { TEXT("ANOMALY"),               ESwarmEventType::Anomaly             },
        { TEXT("DECISION"),              ESwarmEventType::Decision            },
        { TEXT("TASK_HANDOFF"),          ESwarmEventType::TaskHandoff         },
        { TEXT("TASK_SUCCESS"),          ESwarmEventType::TaskSuccess         },
        { TEXT("TASK_FAIL"),             ESwarmEventType::TaskFail            },
        { TEXT("AGENT_SPAWN"),           ESwarmEventType::AgentSpawn          },
        { TEXT("PIPELINE_UPDATE"),       ESwarmEventType::PipelineUpdate      },
    };
    return Map;
}

static const TMap<FString, ERelayChannel>& GetChannelMap()
{
    static const TMap<FString, ERelayChannel> Map = {
        { TEXT("events"),  ERelayChannel::Events  },
        { TEXT("metrics"), ERelayChannel::Metrics },
        { TEXT("alerts"),  ERelayChannel::Alerts  },
        { TEXT("agents"),  ERelayChannel::Agents  },
    };
    return Map;
}

// ─── Priority assignment ──────────────────────────────────────────────────────

EEventPriority USwarmEventRouterSubsystem::AssignPriority(ESwarmEventType EventType)
{
    switch (EventType)
    {
    case ESwarmEventType::Anomaly:
    case ESwarmEventType::SwarmFailed:
    case ESwarmEventType::AgentStepFailed:
        return EEventPriority::Critical;

    case ESwarmEventType::SwarmStarted:
    case ESwarmEventType::SwarmCompleted:
    case ESwarmEventType::PlannerDecision:
    case ESwarmEventType::TaskSuccess:
    case ESwarmEventType::TaskFail:
        return EEventPriority::High;

    case ESwarmEventType::AgentStepStarted:
    case ESwarmEventType::AgentStepCompleted:
    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
    case ESwarmEventType::TaskHandoff:
    case ESwarmEventType::AgentSpawn:
        return EEventPriority::Normal;

    case ESwarmEventType::MetricsSnapshot:
    case ESwarmEventType::AgentStateSnapshot:
    case ESwarmEventType::Decision:
    case ESwarmEventType::SwarmResult:
        return EEventPriority::Low;

    case ESwarmEventType::MetaInsight:
    case ESwarmEventType::PipelineUpdate:
        return EEventPriority::Ambient;

    default:
        return EEventPriority::Normal;
    }
}

// ─── Type / channel parsers ───────────────────────────────────────────────────

ESwarmEventType USwarmEventRouterSubsystem::ParseEventType(const FString& TypeString)
{
    const ESwarmEventType* Found = GetEventTypeMap().Find(TypeString);
    return Found ? *Found : ESwarmEventType::Unknown;
}

ERelayChannel USwarmEventRouterSubsystem::ParseChannel(const FString& ChannelString)
{
    const ERelayChannel* Found = GetChannelMap().Find(ChannelString);
    return Found ? *Found : ERelayChannel::Unknown;
}

// ─── JSON flattening ──────────────────────────────────────────────────────────
// Converts the "data" JSON object into a flat FString→FString map.
// Nested objects are JSON-serialized as strings; arrays similarly.
// This avoids Blueprint needing nested struct access.

void USwarmEventRouterSubsystem::FlattenDataObject(
    const TSharedPtr<FJsonObject>& DataObj,
    TMap<FString, FString>& OutData)
{
    if (!DataObj.IsValid()) return;

    for (const auto& Pair : DataObj->Values)
    {
        const FString& Key = Pair.Key;
        const TSharedPtr<FJsonValue>& Val = Pair.Value;

        if (!Val.IsValid() || Val->Type == EJson::Null)
        {
            OutData.Add(Key, FString());
            continue;
        }

        switch (Val->Type)
        {
        case EJson::String:
            OutData.Add(Key, Val->AsString());
            break;
        case EJson::Number:
            OutData.Add(Key, FString::SanitizeFloat(Val->AsNumber()));
            break;
        case EJson::Boolean:
            OutData.Add(Key, Val->AsBool() ? TEXT("true") : TEXT("false"));
            break;
        case EJson::Object:
        case EJson::Array:
        {
            FString Serialized;
            TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Serialized);
            FJsonSerializer::Serialize(Val.ToSharedRef(), Writer);
            OutData.Add(Key, Serialized);
            break;
        }
        default:
            break;
        }
    }
}

// ─── Message parser ───────────────────────────────────────────────────────────
// Parses a Ue5Message JSON string into FSwarmEvent.
// Returns false if the string is not valid JSON or missing ue5_type.

bool USwarmEventRouterSubsystem::ParseUe5Message(
    const FString& RawJson,
    FSwarmEvent& OutEvent,
    bool bIsReplay)
{
    TSharedPtr<FJsonObject> Root;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawJson);

    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        UE_LOG(LogSwarmRelay, Warning, TEXT("ParseUe5Message: invalid JSON — %s"),
               *RawJson.Left(120));
        return false;
    }

    // Required: ue5_type
    FString TypeString;
    if (!Root->TryGetStringField(TEXT("ue5_type"), TypeString))
    {
        UE_LOG(LogSwarmRelay, Warning, TEXT("ParseUe5Message: missing ue5_type"));
        return false;
    }

    OutEvent.RawJson    = RawJson;
    OutEvent.bIsReplay  = bIsReplay;
    OutEvent.EventType  = ParseEventType(TypeString);

    Root->TryGetStringField(TEXT("timestamp"),       OutEvent.Timestamp);
    Root->TryGetStringField(TEXT("trace_id"),        OutEvent.TraceId);
    Root->TryGetStringField(TEXT("agent_id"),        OutEvent.AgentId);
    Root->TryGetStringField(TEXT("parent_event_id"), OutEvent.ParentEventId);

    FString ChannelStr;
    if (Root->TryGetStringField(TEXT("channel"), ChannelStr))
        OutEvent.Channel = ParseChannel(ChannelStr);

    // Flatten the "data" object
    const TSharedPtr<FJsonObject>* DataObj = nullptr;
    if (Root->TryGetObjectField(TEXT("data"), DataObj) && DataObj)
        FlattenDataObject(*DataObj, OutEvent.Data);

    OutEvent.Priority = AssignPriority(OutEvent.EventType);

    return true;
}

// ─── USubsystem Initialize / Deinitialize ────────────────────────────────────

void USwarmEventRouterSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Allow env-var override of relay URL for deployment flexibility
    FString EnvUrl = FPlatformMisc::GetEnvironmentVariable(TEXT("SWARM_RELAY_URL"));
    if (!EnvUrl.IsEmpty())
        RelayUrl = EnvUrl;

    UE_LOG(LogSwarmRelay, Log, TEXT("SwarmEventRouterSubsystem initializing — relay=%s"), *RelayUrl);

    // Ensure WebSockets module is loaded
    if (!FModuleManager::Get().IsModuleLoaded(TEXT("WebSockets")))
        FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));

    ConnectWebSocket();
}

void USwarmEventRouterSubsystem::Deinitialize()
{
    UE_LOG(LogSwarmRelay, Log, TEXT("SwarmEventRouterSubsystem deinitializing"));
    DisconnectWebSocket();

    if (UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr)
        World->GetTimerManager().ClearTimer(ReconnectTimerHandle);

    Super::Deinitialize();
}

// ─── WebSocket management ─────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::ConnectWebSocket()
{
    if (WebSocket.IsValid() && WebSocket->IsConnected())
        return;

    ConnectionState = ERelayConnectionState::Connecting;

    const FString Protocol = TEXT("ws");
    WebSocket = FWebSocketsModule::Get().CreateWebSocket(RelayUrl, Protocol);

    WebSocket->OnConnected().AddUObject(this, &USwarmEventRouterSubsystem::OnWebSocketConnected);
    WebSocket->OnConnectionError().AddUObject(this, &USwarmEventRouterSubsystem::OnWebSocketConnectionError);
    WebSocket->OnClosed().AddUObject(this, &USwarmEventRouterSubsystem::OnWebSocketClosed);
    WebSocket->OnMessage().AddUObject(this, &USwarmEventRouterSubsystem::OnWebSocketMessage);

    WebSocket->Connect();
}

void USwarmEventRouterSubsystem::DisconnectWebSocket()
{
    if (WebSocket.IsValid())
    {
        WebSocket->OnConnected().RemoveAll(this);
        WebSocket->OnConnectionError().RemoveAll(this);
        WebSocket->OnClosed().RemoveAll(this);
        WebSocket->OnMessage().RemoveAll(this);

        if (WebSocket->IsConnected())
            WebSocket->Close();

        WebSocket.Reset();
    }
    ConnectionState = ERelayConnectionState::Disconnected;
}

void USwarmEventRouterSubsystem::Reconnect()
{
    UE_LOG(LogSwarmRelay, Log, TEXT("Manual reconnect requested"));
    DisconnectWebSocket();
    ConnectWebSocket();
}

// ─── WebSocket event handlers ─────────────────────────────────────────────────

void USwarmEventRouterSubsystem::OnWebSocketConnected()
{
    UE_LOG(LogSwarmRelay, Log, TEXT("Relay connected: %s"), *RelayUrl);
    ConnectionState = ERelayConnectionState::Connected;
    OnRelayConnectionChanged.Broadcast(true);

    // Cancel any pending reconnect timer
    if (UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr)
        World->GetTimerManager().ClearTimer(ReconnectTimerHandle);
}

void USwarmEventRouterSubsystem::OnWebSocketConnectionError(const FString& Error)
{
    UE_LOG(LogSwarmRelay, Warning, TEXT("Relay connection error: %s"), *Error);
    ConnectionState = ERelayConnectionState::Reconnecting;
    OnRelayConnectionChanged.Broadcast(false);
    ScheduleReconnect();
}

void USwarmEventRouterSubsystem::OnWebSocketClosed(
    int32 StatusCode, const FString& Reason, bool bWasClean)
{
    UE_LOG(LogSwarmRelay, Warning,
           TEXT("Relay connection closed: code=%d reason=%s clean=%d"),
           StatusCode, *Reason, bWasClean ? 1 : 0);

    ConnectionState = ERelayConnectionState::Reconnecting;
    OnRelayConnectionChanged.Broadcast(false);
    ScheduleReconnect();
}

void USwarmEventRouterSubsystem::OnWebSocketMessage(const FString& Message)
{
    // This callback fires on the WebSocket receive thread.
    // Push the raw string into PendingEvents under lock.
    // The game thread drains PendingEvents each Tick.

    FSwarmEvent Event;
    if (!ParseUe5Message(Message, Event, false))
    {
        ++TotalEventsDropped;
        return;
    }

    // Skip connection handshake messages — not meaningful for visual state
    if (Event.EventType == ESwarmEventType::Unknown)
    {
        ++TotalEventsDropped;
        return;
    }

    FScopeLock Lock(&PendingLock);
    PendingEvents.Add(MoveTemp(Event));
}

// ─── Reconnect timer ──────────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::ScheduleReconnect()
{
    UWorld* World = GetGameInstance() ? GetGameInstance()->GetWorld() : nullptr;
    if (!World) return;

    if (World->GetTimerManager().IsTimerActive(ReconnectTimerHandle))
        return;

    World->GetTimerManager().SetTimer(
        ReconnectTimerHandle,
        this,
        &USwarmEventRouterSubsystem::OnReconnectTimer,
        ReconnectDelaySeconds,
        false
    );
}

void USwarmEventRouterSubsystem::OnReconnectTimer()
{
    UE_LOG(LogSwarmRelay, Log, TEXT("Attempting relay reconnect..."));
    DisconnectWebSocket();
    ConnectWebSocket();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::Tick(float DeltaTime)
{
    // 1. Move all pending events from the WS thread buffer to the game-thread queue
    DrainPendingToQueue();

    // 2. Dispatch from priority queue at rate-limited pace
    DispatchFromQueue(DeltaTime);
}

TStatId USwarmEventRouterSubsystem::GetStatId() const
{
    RETURN_QUICK_DECLARE_CYCLE_STAT(USwarmEventRouterSubsystem, STATGROUP_Tickables);
}

// ─── Queue management ─────────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::DrainPendingToQueue()
{
    TArray<FSwarmEvent> Drained;
    {
        FScopeLock Lock(&PendingLock);
        Drained = MoveTemp(PendingEvents);
        PendingEvents.Reset();
    }

    for (FSwarmEvent& Event : Drained)
        EnqueueEvent(MoveTemp(Event));
}

void USwarmEventRouterSubsystem::EnqueueEvent(FSwarmEvent&& Event)
{
    FQueuedEvent QE;
    QE.Event = MoveTemp(Event);
    QE.SequenceNumber = NextSequenceNumber++;
    EventQueue.HeapPush(QE);
}

void USwarmEventRouterSubsystem::DispatchFromQueue(float /*DeltaTime*/)
{
    if (EventQueue.Num() == 0) return;

    // Determine how many events to dispatch this tick per priority band
    // Default: Critical=4, High=3, Normal=2, Low=1, Ambient=1
    const int32 NumPriorityBands = 5;
    int32 BandBudget[NumPriorityBands];
    for (int32 i = 0; i < NumPriorityBands; ++i)
    {
        BandBudget[i] = MaxDispatchPerTickByPriority.IsValidIndex(i)
            ? MaxDispatchPerTickByPriority[i]
            : 1;
    }

    int32 Dispatched = 0;
    const int32 MaxPerTick = 10; // hard cap regardless of priority

    while (EventQueue.Num() > 0 && Dispatched < MaxPerTick)
    {
        FQueuedEvent Top;
        EventQueue.HeapPop(Top);

        const int32 BandIndex = static_cast<int32>(Top.Event.Priority);
        if (BandIndex >= 0 && BandIndex < NumPriorityBands)
        {
            if (BandBudget[BandIndex] <= 0)
            {
                // Re-enqueue and stop processing this band
                EventQueue.HeapPush(Top);
                break;
            }
            --BandBudget[BandIndex];
        }

        DispatchEvent(Top.Event);
        ++Dispatched;
    }
}

void USwarmEventRouterSubsystem::FlushQueue()
{
    EventQueue.Reset();
    FScopeLock Lock(&PendingLock);
    PendingEvents.Reset();
}

// ─── Event dispatch ───────────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::DispatchEvent(const FSwarmEvent& Event)
{
    ++TotalEventsProcessed;

    // 1. Update agent state machine before broadcasting so subscribers
    //    can read the already-updated state from GetAgentState().
    UpdateAgentState(Event);

    // 2. Log to output log
    LogEvent(Event);

    // 3. Broadcast to all Blueprint subscribers
    OnSwarmEventReceived.Broadcast(Event);
}

// ─── Agent state machine ──────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::UpdateAgentState(const FSwarmEvent& Event)
{
    // Events without an agent_id affect global state only (handled by listeners)
    const FString& AgentId = Event.AgentId;

    switch (Event.EventType)
    {
    case ESwarmEventType::AgentStepStarted:
    {
        // Ensure record exists
        FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
        Record.AgentId = AgentId;
        Record.CurrentTraceId = Event.TraceId;
        Record.CurrentStepName = Event.GetDataField(TEXT("step_name"));
        Record.LastEventTimestamp = Event.Timestamp;
        SetAgentVisualState(AgentId, EAgentVisualState::Working, Event);
        break;
    }

    case ESwarmEventType::AgentStepCompleted:
    {
        FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
        Record.LastEventTimestamp = Event.Timestamp;
        SetAgentVisualState(AgentId, EAgentVisualState::HandoffSource, Event);
        break;
    }

    case ESwarmEventType::AgentStepFailed:
    {
        FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
        Record.LastEventTimestamp = Event.Timestamp;
        SetAgentVisualState(AgentId, EAgentVisualState::Failed, Event);
        break;
    }

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
    {
        FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
        Record.RetryCount++;
        Record.LastEventTimestamp = Event.Timestamp;
        SetAgentVisualState(AgentId, EAgentVisualState::Retry, Event);
        break;
    }

    case ESwarmEventType::TaskHandoff:
    {
        // "from_agent" becomes HandoffSource via AGENT_STEP_COMPLETED above.
        // The target agent receives AGENT_STEP_STARTED next.
        // TASK_HANDOFF itself carries both agent IDs in data — log only.
        break;
    }

    case ESwarmEventType::TaskSuccess:
    {
        FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
        Record.LastQualityScore = Event.GetDataFloat(TEXT("quality_score"));
        Record.LastEventTimestamp = Event.Timestamp;
        SetAgentVisualState(AgentId, EAgentVisualState::Complete, Event);
        break;
    }

    case ESwarmEventType::SwarmCompleted:
    {
        // Mark all known agents Complete then Idle (transition handled by anim BP timers)
        for (auto& Pair : AgentStates)
            SetAgentVisualState(Pair.Key, EAgentVisualState::Complete, Event);
        break;
    }

    case ESwarmEventType::SwarmFailed:
    {
        // Failed agent set to Failed; others set to Idle
        FString FailedAgent = Event.GetDataField(TEXT("failed_agent_id"));
        for (auto& Pair : AgentStates)
        {
            EAgentVisualState NewState = (Pair.Key == FailedAgent)
                ? EAgentVisualState::Failed
                : EAgentVisualState::Idle;
            SetAgentVisualState(Pair.Key, NewState, Event);
        }
        break;
    }

    case ESwarmEventType::AgentStateSnapshot:
    {
        // Authoritative state override — parse agents array from data
        // The relay flattens "agents" as a JSON string in the Data map.
        // Parse it back to reconcile state.
        FString AgentsJson = Event.GetDataField(TEXT("agents"));
        if (!AgentsJson.IsEmpty())
        {
            TArray<TSharedPtr<FJsonValue>> AgentsArray;
            TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(AgentsJson);
            if (FJsonSerializer::Deserialize(Reader, AgentsArray))
            {
                for (const TSharedPtr<FJsonValue>& AgentVal : AgentsArray)
                {
                    const TSharedPtr<FJsonObject>* AgentObj = nullptr;
                    if (AgentVal->TryGetObject(AgentObj) && AgentObj)
                    {
                        FString Id, StateStr;
                        (*AgentObj)->TryGetStringField(TEXT("agent_id"), Id);
                        (*AgentObj)->TryGetStringField(TEXT("state"), StateStr);
                        if (!Id.IsEmpty())
                        {
                            FAgentStateRecord& Record = AgentStates.FindOrAdd(Id);
                            Record.AgentId = Id;
                            // Map string state to EAgentVisualState
                            if (StateStr == TEXT("WORKING") || StateStr == TEXT("ACTIVE"))
                                Record.VisualState = EAgentVisualState::Working;
                            else if (StateStr == TEXT("ERROR"))
                                Record.VisualState = EAgentVisualState::Failed;
                            else
                                Record.VisualState = EAgentVisualState::Idle;
                        }
                    }
                }
            }
        }
        break;
    }

    default:
        break;
    }
}

void USwarmEventRouterSubsystem::SetAgentVisualState(
    const FString& AgentId,
    EAgentVisualState NewState,
    const FSwarmEvent& /*TriggerEvent*/)
{
    if (AgentId.IsEmpty()) return;

    FAgentStateRecord& Record = AgentStates.FindOrAdd(AgentId);
    if (Record.VisualState == NewState) return;

    Record.AgentId = AgentId;
    Record.VisualState = NewState;

    UE_LOG(LogSwarmRelay, Verbose, TEXT("AgentState: %s → %s"),
           *AgentId,
           *UEnum::GetValueAsString(NewState));

    OnAgentStateChanged.Broadcast(AgentId, NewState);
}

// ─── Blueprint API implementations ────────────────────────────────────────────

FAgentStateRecord USwarmEventRouterSubsystem::GetAgentState(const FString& AgentId) const
{
    const FAgentStateRecord* Found = AgentStates.Find(AgentId);
    if (Found) return *Found;

    FAgentStateRecord Default;
    Default.AgentId = AgentId;
    return Default;
}

TArray<FAgentStateRecord> USwarmEventRouterSubsystem::GetAllAgentStates() const
{
    TArray<FAgentStateRecord> Result;
    AgentStates.GenerateValueArray(Result);
    return Result;
}

void USwarmEventRouterSubsystem::InjectRawJson(const FString& RawJson, bool bMarkAsReplay)
{
    FSwarmEvent Event;
    if (ParseUe5Message(RawJson, Event, bMarkAsReplay))
    {
        FScopeLock Lock(&PendingLock);
        PendingEvents.Add(MoveTemp(Event));
    }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

void USwarmEventRouterSubsystem::LogEvent(const FSwarmEvent& Event)
{
    const FString TypeStr = UEnum::GetValueAsString(Event.EventType);
    const FString AgentStr = Event.AgentId.IsEmpty() ? TEXT("-") : Event.AgentId;
    const FString TraceStr = Event.TraceId.IsEmpty() ? TEXT("-") : Event.TraceId.Left(8);
    const bool bReplay = Event.bIsReplay;

    UE_LOG(LogSwarmRelay, Log,
           TEXT("[%s%s] type=%-28s agent=%-18s trace=%s"),
           bReplay ? TEXT("REPLAY ") : TEXT(""),
           *UEnum::GetValueAsString(Event.Priority),
           *TypeStr,
           *AgentStr,
           *TraceStr);
}
