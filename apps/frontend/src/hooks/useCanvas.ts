import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "~/trpc/react";

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

export interface CanvasData {
  elements: CanvasElement[];
  appState?: CanvasAppState;
  files?: Record<string, any>;
}

export interface UseCanvasOptions {
  sessionId: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

export function useCanvas(options: UseCanvasOptions) {
  const { sessionId, autoSave = true, autoSaveDelay = 2000 } = options;

  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const excalidrawAPIRef = useRef<any>(null);
  const hasUnsavedChangesRef = useRef(false);

  // tRPC mutations
  const saveCanvasMutation = api.canvas.updateCanvas.useMutation({
    onSuccess: (data) => {
      setVersion(data.version);
      setLastSaved(new Date());
      setIsSaving(false);
      hasUnsavedChangesRef.current = false;
    },
    onError: (err) => {
      setError(`Failed to save: ${err.message}`);
      setIsSaving(false);
    },
  });

  // Fetch initial canvas data
  const { data: canvasResult, isLoading: isLoadingCanvas } =
    api.canvas.getCanvas.useQuery(
      { sessionId },
      {
        enabled: !!sessionId,
        onSuccess: (data) => {
          setCanvasData(data.data);
          setVersion(data.version);
          setIsLoading(false);
        },
        onError: (err) => {
          setError(`Failed to load canvas: ${err.message}`);
          setIsLoading(false);
        },
      },
    );

  // Set Excalidraw API reference
  const setExcalidrawAPI = useCallback((api: any) => {
    excalidrawAPIRef.current = api;
  }, []);

  // Save canvas data
  const saveCanvas = useCallback(async () => {
    if (!sessionId || isSaving) return;

    try {
      setIsSaving(true);
      setError(null);

      if (!excalidrawAPIRef.current) {
        throw new Error("Canvas not initialized");
      }

      const elements = excalidrawAPIRef.current.getSceneElements();
      const appState = excalidrawAPIRef.current.getAppState();
      const files = excalidrawAPIRef.current.getFiles();

      const data: CanvasData = { elements, appState, files };

      saveCanvasMutation.mutate({
        sessionId,
        canvasData: data,
        version,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save canvas";
      setError(errorMessage);
      setIsSaving(false);
      console.error("Canvas save error:", err);
    }
  }, [sessionId, isSaving, version, saveCanvasMutation]);

  // Handle canvas changes with auto-save
  const handleCanvasChange = useCallback(
    (
      elements: CanvasElement[],
      appState: CanvasAppState,
      files: Record<string, any>,
    ) => {
      if (autoSave && elements.length > 0) {
        hasUnsavedChangesRef.current = true;

        // Clear existing timeout
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        // Set new timeout for auto-save
        autoSaveTimeoutRef.current = setTimeout(() => {
          if (hasUnsavedChangesRef.current) {
            saveCanvas();
          }
        }, autoSaveDelay);
      }
    },
    [autoSave, autoSaveDelay, saveCanvas],
  );

  // Clear canvas
  const clearCanvas = useCallback(() => {
    if (excalidrawAPIRef.current) {
      excalidrawAPIRef.current.resetScene();
      hasUnsavedChangesRef.current = true;
    }
  }, []);

  // Export canvas
  const exportCanvas = useCallback(
    async (format: "png" | "svg" | "json" = "png") => {
      if (!excalidrawAPIRef.current) {
        throw new Error("Canvas not initialized");
      }

      const elements = excalidrawAPIRef.current.getSceneElements();
      const appState = excalidrawAPIRef.current.getAppState();
      const files = excalidrawAPIRef.current.getFiles();

      switch (format) {
        case "json":
          return {
            elements,
            appState,
            files,
          };
        case "png":
          try {
            const { exportToBlob } = await import("@excalidraw/excalidraw");
            return await exportToBlob({
              elements,
              appState,
              files,
              mimeType: "image/png",
              quality: 1,
            });
          } catch (err) {
            console.error("Failed to export PNG:", err);
            throw new Error("Failed to export as PNG");
          }
        case "svg":
          try {
            const { exportToSvg } = await import("@excalidraw/excalidraw");
            return await exportToSvg({
              elements,
              appState,
              files,
            });
          } catch (err) {
            console.error("Failed to export SVG:", err);
            throw new Error("Failed to export as SVG");
          }
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    },
    [],
  );

  // Auto-save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (hasUnsavedChangesRef.current && excalidrawAPIRef.current) {
        saveCanvas();
      }
    };
  }, [saveCanvas]);

  return {
    // State
    canvasData,
    version,
    isLoading,
    isSaving,
    lastSaved,
    error,

    // API reference
    setExcalidrawAPI,

    // Actions
    saveCanvas,
    clearCanvas,
    exportCanvas,
    handleCanvasChange,

    // Utilities
    hasUnsavedChanges: hasUnsavedChangesRef.current,
  };
}
