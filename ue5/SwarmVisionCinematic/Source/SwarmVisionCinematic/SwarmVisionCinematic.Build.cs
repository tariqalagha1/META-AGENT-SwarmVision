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

			// CineCameraActor, CineCameraComponent
			"CinematicCamera",

			// Niagara particle systems
			"Niagara",

			// Pixel Streaming data channel
			"PixelStreaming",
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"HTTP",
		});

		// Suppress warning C4668 from Windows SDK headers
		bEnableUndefinedIdentifierWarnings = false;
	}
}
