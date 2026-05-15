#include "Platform/ViewerModeController.h"

void UViewerModeController::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    CurrentConfig = BuildConfig(CurrentMode);
}

void UViewerModeController::SetViewerMode(EViewerMode NewMode)
{
    if (CurrentMode == NewMode) return;

    const EViewerMode Old = CurrentMode;
    CurrentMode   = NewMode;
    CurrentConfig = BuildConfig(NewMode);

    OnViewerModeChanged.Broadcast(Old, NewMode);
}

FViewerModeConfig UViewerModeController::BuildConfig(EViewerMode Mode)
{
    FViewerModeConfig C;
    switch (Mode)
    {
    case EViewerMode::Executive:
        C.bShowTelemetryGraphs   = false;
        C.bShowAgentLabels       = false;
        C.bShowEventFeed         = false;
        C.bShowReplayControls    = false;
        C.bShowQualityScore      = true;
        C.bShowBookmarkTimeline  = false;
        C.bAutoCinematicCamera   = true;
        C.bAllowFreeCam          = false;
        C.bFocusAnomalies        = false;
        C.bReducePostProcess     = false;
        C.bHighlightAnomalyZones = false;
        break;

    case EViewerMode::Observability:
        C.bShowTelemetryGraphs   = true;
        C.bShowAgentLabels       = true;
        C.bShowEventFeed         = true;
        C.bShowReplayControls    = false;
        C.bShowQualityScore      = true;
        C.bShowBookmarkTimeline  = false;
        C.bAutoCinematicCamera   = false;
        C.bAllowFreeCam          = false;
        C.bFocusAnomalies        = false;
        C.bReducePostProcess     = true;   // prioritize clarity over film look
        C.bHighlightAnomalyZones = false;
        break;

    case EViewerMode::Incident:
        C.bShowTelemetryGraphs   = true;
        C.bShowAgentLabels       = true;
        C.bShowEventFeed         = true;
        C.bShowReplayControls    = true;
        C.bShowQualityScore      = true;
        C.bShowBookmarkTimeline  = true;
        C.bAutoCinematicCamera   = false;
        C.bAllowFreeCam          = false;
        C.bFocusAnomalies        = true;
        C.bReducePostProcess     = true;
        C.bHighlightAnomalyZones = true;
        break;

    case EViewerMode::Inspector:
        C.bShowTelemetryGraphs   = true;
        C.bShowAgentLabels       = true;
        C.bShowEventFeed         = true;
        C.bShowReplayControls    = true;
        C.bShowQualityScore      = true;
        C.bShowBookmarkTimeline  = true;
        C.bAutoCinematicCamera   = false;
        C.bAllowFreeCam          = true;
        C.bFocusAnomalies        = false;
        C.bReducePostProcess     = true;
        C.bHighlightAnomalyZones = false;
        break;
    }
    return C;
}
