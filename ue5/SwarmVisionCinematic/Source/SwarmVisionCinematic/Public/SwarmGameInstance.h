#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "SwarmGameInstance.generated.h"

// ─── USwarmGameInstance ───────────────────────────────────────────────────────
//
// Custom GameInstance. Set as the GameInstance class in Project Settings.
// The subsystem (USwarmEventRouterSubsystem) is auto-created by the engine
// as a GameInstanceSubsystem — no manual creation needed here.
// This class exists as the designated GameInstance for the project so that
// subsystem initialization order is deterministic.

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    virtual void Init() override;
    virtual void Shutdown() override;
};
