"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";

// Dynamically import Excalidraw with no SSR to avoid hydration issues
const Excalidraw = dynamic(
  async () => {
    const { Excalidraw } = await import("@excalidraw/excalidraw");
    return Excalidraw;
  },
  { ssr: false },
);

// Types for canvas data
interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: any;
}

interface CanvasAppState {
  viewBackgroundColor?: string;
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  currentItemFillStyle?: string;
  currentItemStrokeWidth?: number;
  currentItemRoughness?: number;
  currentItemOpacity?: number;
  currentItemFontFamily?: string;
  currentItemFontSize?: number;
  currentItemTextAlign?: string;
  currentItemStartArrowhead?: string;
  currentItemEndArrowhead?: string;
  [key: string]: any;
}

interface CanvasData {
  elements: CanvasElement[];
  appState?: CanvasAppState;
  files?: Record<string, any>;
}

interface ExcalidrawCanvasProps {
  initialData?: CanvasData;
  onSave?: (data: CanvasData) => void;
  readOnly?: boolean;
  className?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

export default function ExcalidrawCanvas({
  initialData,
  onSave,
  readOnly = false,
  className = "",
  autoSave = true,
  autoSaveInterval = 5000,
}: ExcalidrawCanvasProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [currentTool, setCurrentTool] = useState<string>("selection");
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Only render on client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || readOnly || !excalidrawAPI) return;

    const intervalId = setInterval(() => {
      const elements = excalidrawAPI.getSceneElements();
      if (elements.length > 0) {
        handleSave();
      }
    }, autoSaveInterval);

    return () => clearInterval(intervalId);
  }, [autoSave, readOnly, excalidrawAPI, autoSaveInterval]);

  // Handle canvas changes
  const handleChange = useCallback(
    (
      elements: CanvasElement[],
      appState: CanvasAppState,
      files: Record<string, any>,
    ) => {
      // Update current tool state
      if (appState.currentTool) {
        setCurrentTool(appState.currentTool.type || "selection");
      }

      // Update zoom level
      if (appState.zoom) {
        setZoomLevel(appState.zoom.value);
      }
    },
    [],
  );

  // Handle manual save
  const handleSave = useCallback(() => {
    if (excalidrawAPI && onSave) {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      onSave({ elements, appState, files });
      setLastSaveTime(new Date());
    }
  }, [excalidrawAPI, onSave]);

  // Clear canvas
  const handleClear = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.resetScene();
    }
  }, [excalidrawAPI]);

  // Export as PNG
  const handleExportPNG = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: "image/png",
        quality: 1,
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `canvas-export-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export PNG:", error);
    }
  }, [excalidrawAPI]);

  // Export as SVG
  const handleExportSVG = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const svg = await exportToSvg({
        elements,
        appState,
        files,
      });

      // Convert SVG to blob and download
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `canvas-export-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export SVG:", error);
    }
  }, [excalidrawAPI]);

  // Export as JSON
  const handleExportJSON = useCallback(() => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const jsonString = JSON.stringify({ elements, appState, files }, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `canvas-export-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [excalidrawAPI]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.zoomIn();
    }
  }, [excalidrawAPI]);

  const handleZoomOut = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.zoomOut();
    }
  }, [excalidrawAPI]);

  const handleResetView = useCallback(() => {
    if (excalidrawAPI) {
      excalidrawAPI.resetScene();
    }
  }, [excalidrawAPI]);

  if (!mounted) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg bg-gray-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <p className="text-gray-600">Loading Canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`excalidraw-container ${className}`}>
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar flex flex-wrap gap-2 border-b bg-gray-100 p-2">
        {/* Left side - Main actions */}
        <div className="flex gap-2">
          {!readOnly && (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 rounded bg-blue-500 px-3 py-1 text-white transition-colors hover:bg-blue-600"
                title="Save canvas"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                Save
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1 rounded bg-red-500 px-3 py-1 text-white transition-colors hover:bg-red-600"
                title="Clear canvas"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Clear
              </button>
            </>
          )}
        </div>

        {/* Middle - Zoom controls */}
        <div className="ml-2 flex gap-1">
          <button
            onClick={handleZoomOut}
            className="rounded bg-gray-200 px-2 py-1 text-gray-700 transition-colors hover:bg-gray-300"
            title="Zoom out"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
          <span className="rounded bg-white px-2 py-1 text-xs text-gray-700">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="rounded bg-gray-200 px-2 py-1 text-gray-700 transition-colors hover:bg-gray-300"
            title="Zoom in"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
          <button
            onClick={handleResetView}
            className="rounded bg-gray-200 px-2 py-1 text-gray-700 transition-colors hover:bg-gray-300"
            title="Reset view"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </button>
        </div>

        {/* Right side - Export options */}
        <div className="ml-auto flex gap-1">
          <div className="group relative">
            <button
              className="flex items-center gap-1 rounded bg-green-500 px-3 py-1 text-white transition-colors hover:bg-green-600"
              title="Export options"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Export
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <div className="ring-opacity-5 absolute right-0 z-10 mt-1 hidden w-36 rounded-md bg-white shadow-lg ring-1 ring-black group-hover:block">
              <div className="py-1" role="menu" aria-orientation="vertical">
                <button
                  onClick={handleExportPNG}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                  Export as PNG
                </button>
                <button
                  onClick={handleExportSVG}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                  Export as SVG
                </button>
                <button
                  onClick={handleExportJSON}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                  Export as JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        {lastSaveTime && (
          <div className="ml-2 flex items-center text-xs text-gray-500">
            Last saved: {lastSaveTime.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Excalidraw Canvas */}
      <div
        className="excalidraw-wrapper"
        style={{ height: "600px", width: "100%" }}
      >
        <Excalidraw
          ref={(api) => setExcalidrawAPI(api)}
          initialData={initialData}
          onChange={handleChange}
          viewModeEnabled={readOnly}
          zenModeEnabled={false}
          gridModeEnabled={true}
          theme="light"
          name="System Design Canvas"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              toggleTheme: true,
            },
          }}
        />
      </div>
    </div>
  );
}
