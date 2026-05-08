#include "SwarmGameInstance.h"

DEFINE_LOG_CATEGORY_STATIC(LogSwarmGame, Log, All);

void USwarmGameInstance::Init()
{
    Super::Init();
    UE_LOG(LogSwarmGame, Log, TEXT("SwarmVisionCinematic GameInstance initialized"));
}

void USwarmGameInstance::Shutdown()
{
    UE_LOG(LogSwarmGame, Log, TEXT("SwarmVisionCinematic GameInstance shutting down"));
    Super::Shutdown();
}
