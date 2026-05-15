// SwarmVisionCinematic.Build.cs
// Module build rules — declares all engine and plugin dependencies.

using UnrealBuildTool;

public class SwarmVisionCinematic : ModuleRules
{
	public SwarmVisionCinematic(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",

			// WebSocket — IWebSocket, IWebSocketsManager
			"WebSockets",

			// JSON parsing — FJsonObject, FJsonSerializer
			"Json",
			"JsonUtilities",

			// UMG widgets
			"UMG",
			"Slate",
			"SlateCore",

			// CineCameraActor, CineCameraComponent, focal length / aperture API
			"CinematicCamera",

			// Niagara particle systems
			"Niagara",

			// Pixel Streaming data channel
			"PixelStreaming",

			// MetaHuman body + face skeletal mesh animation
			"AnimGraphRuntime",

			// Control Rig — IK, procedural joint control
			"ControlRig",
			"RigVM",

			// Post-process volume settings (UPostProcessComponent)
			"RenderCore",

			// Groom (hair) component — soft dependency, guarded in code
			// "HairStrandsCore", // Uncomment if Groom plugin is present

			// Level Sequences for cinematic playback
			"LevelSequence",
			"MovieScene",

			// HTTP client — intelligence-service REST polling
			"HTTP",
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			// HTTP moved to public — USwarmIntelligenceSubsystem polls intelligence-service


			// Spline components — USplineComponent, USplineMeshComponent
			"ProceduralMeshComponent",

			// KismetMaterialLibrary for MPC writes
			"Engine",

			// AIModule for placeholder agent movement
			"AIModule",
			"NavigationSystem",

			// ExponentialHeightFog component access
			"Renderer",

			// Camera tracking focus — ECameraFocusMethod
			"CinematicCamera",
		});

		// Suppress warning C4668 from Windows SDK headers
		bEnableUndefinedIdentifierWarnings = false;
	}
}
