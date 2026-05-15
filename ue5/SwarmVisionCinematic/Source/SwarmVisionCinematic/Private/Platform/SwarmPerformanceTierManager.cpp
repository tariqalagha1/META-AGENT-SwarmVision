#include "Platform/SwarmPerformanceTierManager.h"
#include "HAL/IConsoleManager.h"

void USwarmPerformanceTierManager::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    CurrentSettings = BuildSettings(CurrentTier);
    ApplyConsoleVars(CurrentSettings);
}

void USwarmPerformanceTierManager::SetTier(EPerformanceTier NewTier)
{
    if (CurrentTier == NewTier) return;

    const EPerformanceTier Old = CurrentTier;
    CurrentTier     = NewTier;
    CurrentSettings = BuildSettings(NewTier);
    ApplyConsoleVars(CurrentSettings);

    OnTierChanged.Broadcast(Old, NewTier);
}

void USwarmPerformanceTierManager::ApplyConsoleVars(const FPerformanceTierSettings& S) const
{
    auto Set = [](const TCHAR* CVar, float Val) {
        if (IConsoleVariable* V = IConsoleManager::Get().FindConsoleVariable(CVar))
            V->Set(Val, ECVF_SetByCode);
    };
    auto SetI = [](const TCHAR* CVar, int32 Val) {
        if (IConsoleVariable* V = IConsoleManager::Get().FindConsoleVariable(CVar))
            V->Set(Val, ECVF_SetByCode);
    };

    Set(TEXT("r.Lumen.DiffuseIndirect.Allow"),          S.bLumenEnabled ? 1.f : 0.f);
    Set(TEXT("r.Lumen.Reflections.Allow"),               S.bLumenEnabled ? 1.f : 0.f);
    Set(TEXT("r.LumenScene.SurfaceCache.SamplesPerPixel"), S.LumenSceneLightingQuality);
    Set(TEXT("r.Lumen.FinalGather.Quality"),              S.LumenFinalGatherQuality);
    Set(TEXT("r.Lumen.Reflections.Quality"),              S.LumenReflectionQuality);

    SetI(TEXT("r.Shadow.MaxResolution"),                 S.ShadowQuality >= 3 ? 4096 : (S.ShadowQuality >= 2 ? 2048 : 1024));
    Set(TEXT("r.Shadow.DistanceScale"),                  S.ShadowDistanceScale);

    Set(TEXT("r.MotionBlur.Amount"),                     S.MotionBlurAmount);
    Set(TEXT("r.BloomQuality"),                          S.BloomIntensity > 0.f ? 5.f : 0.f);
    Set(TEXT("r.DepthOfFieldQuality"),                   S.bDepthOfFieldEnabled ? 2.f : 0.f);
    Set(TEXT("r.AmbientOcclusion.Intensity"),            S.AmbientOcclusionIntensity);

    Set(TEXT("fx.Niagara.QualityLevel"),                 S.NiagaraScalability);
    Set(TEXT("r.StaticMesh.LODDistanceScale"),           FMath::Pow(2.f, -S.LODBias));

    SetI(TEXT("t.MaxFPS"),                               S.TargetFPS);
}

FPerformanceTierSettings USwarmPerformanceTierManager::BuildSettings(EPerformanceTier Tier)
{
    FPerformanceTierSettings S;
    switch (Tier)
    {
    case EPerformanceTier::Cinematic:
        S.LumenSceneLightingQuality = 1.0f;
        S.LumenFinalGatherQuality   = 1.0f;
        S.LumenReflectionQuality    = 1.0f;
        S.bLumenEnabled             = true;
        S.ShadowDistanceScale       = 1.0f;
        S.ShadowQuality             = 3;
        S.MotionBlurAmount          = 0.5f;
        S.BloomIntensity            = 1.0f;
        S.bDepthOfFieldEnabled      = true;
        S.AmbientOcclusionIntensity = 0.5f;
        S.NiagaraScalability        = 1.0f;
        S.LODBias                   = 0.f;
        S.TargetFPS                 = 60;
        S.BitrateKbps               = 15000;
        break;

    case EPerformanceTier::Standard:
        S.LumenSceneLightingQuality = 0.6f;
        S.LumenFinalGatherQuality   = 0.5f;
        S.LumenReflectionQuality    = 0.5f;
        S.bLumenEnabled             = true;
        S.ShadowDistanceScale       = 0.7f;
        S.ShadowQuality             = 2;
        S.MotionBlurAmount          = 0.3f;
        S.BloomIntensity            = 0.7f;
        S.bDepthOfFieldEnabled      = true;
        S.AmbientOcclusionIntensity = 0.3f;
        S.NiagaraScalability        = 0.6f;
        S.LODBias                   = 1.f;
        S.TargetFPS                 = 60;
        S.BitrateKbps               = 8000;
        break;

    case EPerformanceTier::Cloud:
        S.LumenSceneLightingQuality = 0.f;
        S.LumenFinalGatherQuality   = 0.f;
        S.LumenReflectionQuality    = 0.f;
        S.bLumenEnabled             = false;
        S.ShadowDistanceScale       = 0.4f;
        S.ShadowQuality             = 1;
        S.MotionBlurAmount          = 0.f;
        S.BloomIntensity            = 0.3f;
        S.bDepthOfFieldEnabled      = false;
        S.AmbientOcclusionIntensity = 0.f;
        S.NiagaraScalability        = 0.3f;
        S.LODBias                   = 2.f;
        S.TargetFPS                 = 30;
        S.BitrateKbps               = 4000;
        break;
    }
    return S;
}
