#include "HUD/SwarmHUDRoot.h"

void USwarmHUDRoot::NativeConstruct()
{
    Super::NativeConstruct();
}

void USwarmHUDRoot::SetCinematicMode(bool bCinematic)
{
    bCinematicMode = bCinematic;
    BP_FadeHUD(!bCinematic, 0.5f);
}
