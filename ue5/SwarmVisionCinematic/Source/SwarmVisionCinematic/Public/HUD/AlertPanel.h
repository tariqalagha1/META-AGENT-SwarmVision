#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "AlertPanel.generated.h"

USTRUCT(BlueprintType)
struct FAlertEntry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Message;

    UPROPERTY(BlueprintReadOnly)
    FLinearColor Color = FLinearColor(1.f, 0.05f, 0.05f);

    UPROPERTY(BlueprintReadOnly)
    FString Timestamp;

    UPROPERTY(BlueprintReadOnly)
    bool bAcknowledged = false;
};

// ─── UAlertPanel ──────────────────────────────────────────────────────────────
//
// Overlay alert widget — WBP_AlertPanel in Blueprint.
// Triggers on: Anomaly, SwarmFailed, AgentStepFailed, TaskFail.
// BP subclass plays animation, then BP_OnAlertCleared is called.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API UAlertPanel : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    // Auto-dismiss after this many seconds (0 = manual dismiss only)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Alert")
    float AutoDismissSeconds = 4.f;

    UFUNCTION(BlueprintCallable, Category="HUD|Alert")
    void DismissCurrentAlert();

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Alert")
    bool HasActiveAlert() const { return bAlertActive; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Alert")
    FAlertEntry GetCurrentAlert() const { return CurrentAlert; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Alert")
    TArray<FAlertEntry> GetAlertHistory() const { return AlertHistory; }

    // BP hook — when alert should be shown
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Alert")
    void BP_ShowAlert(const FAlertEntry& Alert);

    // BP hook — when alert is cleared
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Alert")
    void BP_OnAlertCleared();

protected:
    virtual void NativeConstruct() override;
    virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
    UFUNCTION()
    void OnEventForAlert(const FSwarmEvent& Event);

    void TriggerAlert(const FString& Message, FLinearColor Color, const FString& Timestamp);

    bool       bAlertActive   = false;
    float      DismissTimer   = 0.f;
    FAlertEntry CurrentAlert;
    TArray<FAlertEntry> AlertHistory;
};
