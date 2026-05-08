#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Data/SwarmEvent.h"
#include "Camera/CameraActor.h"
#include "SwarmCameraDirector.generated.h"

// ─── FShotConfig ──────────────────────────────────────────────────────────────

USTRUCT(BlueprintType)
struct FShotConfig
{
    GENERATED_BODY()

    // Name of the ACameraActor to activate (must exist in the level)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName CameraName;

    // Camera blend time in seconds (0 = hard cut)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float BlendTime = 0.5f;

    // How long to hold this shot before auto-returning to idle
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float HoldDuration = 5.0f;

    // Whether a lower-priority event can interrupt this shot
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    bool bCanBeInterrupted = true;
};

// ─── ASwarmCameraDirector ─────────────────────────────────────────────────────
//
// Phase 1 camera director.
// Subscribes to the event router, selects a camera actor per event type,
// calls SetViewTargetWithBlend on the player controller.
//
// Camera actors are referenced by name — place them in the level with exact names:
//   Camera_Entry, Camera_Fetch, Camera_Normalize, Camera_Quality,
//   Camera_Corridor, Camera_Mezzanine, Camera_Gate
//
// Full director (ACinematicDirector) replaces this in Phase 4.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ASwarmCameraDirector : public AActor
{
    GENERATED_BODY()

public:
    ASwarmCameraDirector();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    // ── Configuration ────────────────────────────────────────────────────────

    // Event type → camera name mapping (editable in Details panel)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="CameraDirector")
    TMap<FString, FShotConfig> EventCameraMap;

    // Seconds of inactivity before returning to idle camera
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="CameraDirector")
    float IdleReturnDelay = 8.0f;

    // Name of the idle camera (used when no events are firing)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="CameraDirector")
    FName IdleCameraName = TEXT("Camera_Mezzanine");

    // ── Blueprint events ─────────────────────────────────────────────────────

    // Called whenever the director activates a new camera
    UFUNCTION(BlueprintImplementableEvent, Category="CameraDirector")
    void OnCameraActivated(const FName& CameraName, const FSwarmEvent& TriggerEvent);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    void ActivateCamera(const FName& CameraName, float BlendTime,
                        const FSwarmEvent& TriggerEvent);
    void ReturnToIdle();
    void PopulateDefaultEventMap();

    ACameraActor* FindCameraByName(const FName& Name) const;

    FName CurrentCameraName;
    FTimerHandle IdleReturnTimer;
    FTimerHandle HoldTimer;
};
