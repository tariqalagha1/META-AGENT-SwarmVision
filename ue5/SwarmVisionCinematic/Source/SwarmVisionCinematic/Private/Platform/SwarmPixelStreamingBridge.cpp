#include "Platform/SwarmPixelStreamingBridge.h"
#include "Platform/ViewerModeController.h"
#include "Platform/SwarmPerformanceTierManager.h"
#include "Replay/SwarmReplaySubsystem.h"
#include "Engine/GameInstance.h"
#include "Misc/Json.h"

// Pixel Streaming plugin — conditionally included; graceful fallback if not present
#if WITH_EDITOR || defined(SWARMVISION_PIXEL_STREAMING)
#include "IPixelStreamingModule.h"
#include "IPixelStreamingStreamer.h"
#endif

void USwarmPixelStreamingBridge::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

#if defined(SWARMVISION_PIXEL_STREAMING)
    if (IPixelStreamingModule* PSModule = FModuleManager::GetModulePtr<IPixelStreamingModule>("PixelStreaming"))
    {
        if (TSharedPtr<IPixelStreamingStreamer> Streamer = PSModule->GetStreamer(PSModule->GetDefaultStreamerID()))
        {
            DataChannelHandle = Streamer->OnSendPlayerMessage.AddLambda(
                [this](FString Msg) { OnDataChannelMessage(Msg); });
        }
    }
#endif
}

void USwarmPixelStreamingBridge::Deinitialize()
{
#if defined(SWARMVISION_PIXEL_STREAMING)
    if (IPixelStreamingModule* PSModule = FModuleManager::GetModulePtr<IPixelStreamingModule>("PixelStreaming"))
    {
        if (TSharedPtr<IPixelStreamingStreamer> Streamer = PSModule->GetStreamer(PSModule->GetDefaultStreamerID()))
        {
            Streamer->OnSendPlayerMessage.Remove(DataChannelHandle);
        }
    }
#endif
    Super::Deinitialize();
}

// ─── Send to viewer ────────────────────────────────────────────────────────────

void USwarmPixelStreamingBridge::SendToViewer(
    const FString& Type, const FString& PayloadJson)
{
    const FString Msg = FString::Printf(
        TEXT("{\"type\":\"%s\",\"payload\":%s}"), *Type, *PayloadJson);

#if defined(SWARMVISION_PIXEL_STREAMING)
    if (IPixelStreamingModule* PSModule = FModuleManager::GetModulePtr<IPixelStreamingModule>("PixelStreaming"))
    {
        if (TSharedPtr<IPixelStreamingStreamer> Streamer = PSModule->GetStreamer(PSModule->GetDefaultStreamerID()))
        {
            Streamer->SendPlayerMessage(Msg);
        }
    }
#else
    // In editor / non-PS builds: log only
    UE_LOG(LogTemp, Verbose, TEXT("[PSBridge] → %s"), *Msg);
#endif
}

void USwarmPixelStreamingBridge::BroadcastSwarmState(
    const FString& SwarmId, const FString& StateJson)
{
    const FString Payload = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"state\":%s}"), *SwarmId, *StateJson);
    SendToViewer(TEXT("swarm_state"), Payload);
}

void USwarmPixelStreamingBridge::BroadcastReplayPosition(int64 OffsetMs, float Progress)
{
    const FString Payload = FString::Printf(
        TEXT("{\"offset_ms\":%lld,\"progress\":%.4f}"), OffsetMs, Progress);
    SendToViewer(TEXT("replay_position"), Payload);
}

void USwarmPixelStreamingBridge::BroadcastViewerMode(EViewerMode Mode)
{
    const UEnum* E = StaticEnum<EViewerMode>();
    const FString ModeStr = E
        ? E->GetNameStringByValue(static_cast<int64>(Mode))
        : FString::FromInt(static_cast<int32>(Mode));
    SendToViewer(TEXT("viewer_mode"), FString::Printf(TEXT("\"%s\""), *ModeStr));
}

void USwarmPixelStreamingBridge::BroadcastQualityScore(float Score, const FString& SwarmId)
{
    const FString Payload = FString::Printf(
        TEXT("{\"swarm_id\":\"%s\",\"quality_score\":%.2f}"), *SwarmId, Score);
    SendToViewer(TEXT("quality_score"), Payload);
}

// ─── Receive from viewer ───────────────────────────────────────────────────────

void USwarmPixelStreamingBridge::OnDataChannelMessage(const FString& JsonMessage)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonMessage);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    FPixelStreamingMessage Msg;
    Root->TryGetStringField(TEXT("type"),    Msg.Type);
    Root->TryGetStringField(TEXT("payload"), Msg.Payload);

    DispatchMessage(Msg);
    OnMessageReceived.Broadcast(Msg);
}

void USwarmPixelStreamingBridge::DispatchMessage(const FPixelStreamingMessage& Msg)
{
    if (Msg.Type == TEXT("mode_switch"))    HandleModeSwitch(Msg.Payload);
    else if (Msg.Type == TEXT("replay_control")) HandleReplayControl(Msg.Payload);
    else if (Msg.Type == TEXT("tier_set"))   HandleTierSet(Msg.Payload);
}

void USwarmPixelStreamingBridge::HandleModeSwitch(const FString& Payload)
{
    if (UViewerModeController* VMC = GetGameInstance()->GetSubsystem<UViewerModeController>())
    {
        if      (Payload.Contains(TEXT("observability"))) VMC->SetViewerMode(EViewerMode::Observability);
        else if (Payload.Contains(TEXT("incident")))      VMC->SetViewerMode(EViewerMode::Incident);
        else if (Payload.Contains(TEXT("inspector")))     VMC->SetViewerMode(EViewerMode::Inspector);
        else                                               VMC->SetViewerMode(EViewerMode::Executive);
    }
}

void USwarmPixelStreamingBridge::HandleReplayControl(const FString& Payload)
{
    USwarmReplaySubsystem* Replay =
        GetGameInstance()->GetSubsystem<USwarmReplaySubsystem>();
    if (!Replay) return;

    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Payload);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

    FString Action;
    Root->TryGetStringField(TEXT("action"), Action);

    if (Action == TEXT("play"))       Replay->Play();
    else if (Action == TEXT("pause")) Replay->Pause();
    else if (Action == TEXT("stop"))  Replay->Stop();
    else if (Action == TEXT("seek"))
    {
        double TargetMs = 0.0;
        Root->TryGetNumberField(TEXT("target_ms"), TargetMs);
        Replay->SeekToMs(static_cast<int64>(TargetMs));
    }
    else if (Action == TEXT("set_rate"))
    {
        double Rate = 1.0;
        Root->TryGetNumberField(TEXT("rate"), Rate);
        Replay->SetPlaybackRate(static_cast<float>(Rate));
    }
    else if (Action == TEXT("next_bookmark")) Replay->SeekToNextBookmark();
    else if (Action == TEXT("prev_bookmark")) Replay->SeekToPrevBookmark();
}

void USwarmPixelStreamingBridge::HandleTierSet(const FString& Payload)
{
    USwarmPerformanceTierManager* PTM =
        GetGameInstance()->GetSubsystem<USwarmPerformanceTierManager>();
    if (!PTM) return;

    if      (Payload.Contains(TEXT("cinematic"))) PTM->SetTier(EPerformanceTier::Cinematic);
    else if (Payload.Contains(TEXT("standard")))  PTM->SetTier(EPerformanceTier::Standard);
    else if (Payload.Contains(TEXT("cloud")))     PTM->SetTier(EPerformanceTier::Cloud);
}
