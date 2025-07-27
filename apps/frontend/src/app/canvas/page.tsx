"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "~/trpc/react";
import { useCanvas } from "~/hooks/useCanvas";

// Dynamically import the canvas component to avoid SSR issues
const ExcalidrawCanvas = dynamic(
  () => import("~/components/canvas/ExcalidrawCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center rounded-lg bg-gray-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <p className="text-gray-600">Loading Canvas...</p>
        </div>
      </div>
    ),
  },
);

export default function CanvasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);

  // Get session details
  const { data: sessionData } = api.design.getSession.useQuery(
    { id: sessionId as string },
    { enabled: !!sessionId },
  );

  // Use canvas hook
  const {
    canvasData,
    isLoading,
    isSaving,
    lastSaved,
    error,
    saveCanvas,
    handleCanvasChange,
    setExcalidrawAPI,
  } = useCanvas({
    sessionId: sessionId as string,
    autoSave: true,
    autoSaveDelay: 2000,
  });

  // Get AI suggestions mutation
  const aiSuggestionsMutation =
    api.canvas.generateDiagramSuggestions.useMutation({
      onSuccess: (data) => {
        setAiSuggestions(data.suggestions || []);
      },
    });

  // Insert AI diagram mutation
  const insertDiagramMutation = api.canvas.insertGeneratedDiagram.useMutation({
    onSuccess: () => {
      setShowAiSuggestions(false);
      // Refresh canvas data
      router.refresh();
    },
  });

  // Request AI suggestions
  const handleRequestAiSuggestions = () => {
    if (!sessionId) return;

    aiSuggestionsMutation.mutate({
      sessionId: sessionId as string,
    });
    setShowAiSuggestions(true);
  };

  // Insert AI diagram
  const handleInsertDiagram = (diagramType: string) => {
    if (!sessionId) return;

    insertDiagramMutation.mutate({
      sessionId: sessionId as string,
      diagramType,
      position: { x: 100, y: 100 },
    });
  };

  // If no session ID is provided, show error
  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <h2 className="mb-4 text-2xl font-bold text-red-600">
            Session ID Required
          </h2>
          <p className="mb-6 text-gray-600">
            Please provide a valid design session ID to access the canvas.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {sessionData?.title || "System Design Canvas"}
              </h1>
              <p className="text-sm text-gray-600">
                {sessionData?.category || "Interactive design canvas"}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Save Status Indicator */}
              <div className="flex items-center gap-2">
                {isSaving && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
                    <span className="text-sm">Saving...</span>
                  </div>
                )}
                {lastSaved && !isSaving && (
                  <div className="flex items-center gap-2 text-green-600">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm">
                      Saved at {lastSaved.toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 text-red-600">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm">{error}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <button
                onClick={handleRequestAiSuggestions}
                className="flex items-center gap-2 rounded-md bg-purple-500 px-4 py-2 text-white transition-colors hover:bg-purple-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
                </svg>
                AI Suggestions
              </button>
              <button
                onClick={() => router.push(`/design/${sessionId}`)}
                className="rounded-md bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
              >
                Back to Session
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-6">
          {/* Canvas Container */}
          <div className="flex-1">
            <div className="rounded-lg border bg-white shadow-sm">
              {isLoading ? (
                <div className="flex h-96 items-center justify-center rounded-lg bg-gray-100">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
                    <p className="text-gray-600">Loading Canvas...</p>
                  </div>
                </div>
              ) : (
                <ExcalidrawCanvas
                  initialData={canvasData || undefined}
                  onSave={saveCanvas}
                  className="overflow-hidden rounded-lg"
                  autoSave={true}
                />
              )}
            </div>
          </div>

          {/* AI Suggestions Panel (conditionally shown) */}
          {showAiSuggestions && (
            <div className="w-80 rounded-lg border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  AI Diagram Suggestions
                </h3>
                <button
                  onClick={() => setShowAiSuggestions(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {aiSuggestionsMutation.isLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-purple-500"></div>
                    <p className="text-sm text-gray-600">
                      Generating suggestions...
                    </p>
                  </div>
                </div>
              ) : aiSuggestions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-gray-500">No suggestions available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {aiSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.type}
                      className="cursor-pointer rounded-md border p-3 hover:bg-gray-50"
                      onClick={() => handleInsertDiagram(suggestion.type)}
                    >
                      <h4 className="font-medium text-gray-900">
                        {suggestion.title}
                      </h4>
                      <p className="mt-1 text-sm text-gray-600">
                        {suggestion.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {suggestion.elements} elements •{" "}
                          {suggestion.complexity} complexity
                        </span>
                        <button className="text-xs font-medium text-purple-600">
                          Insert
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 rounded-lg bg-blue-50 p-6">
          <h3 className="mb-3 text-lg font-semibold text-blue-900">
            Canvas Features
          </h3>
          <div className="grid grid-cols-1 gap-4 text-sm text-blue-800 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-medium">Drawing Tools:</h4>
              <ul className="space-y-1">
                <li>• Rectangle, Circle, Diamond shapes</li>
                <li>• Lines and arrows for connections</li>
                <li>• Text annotations</li>
                <li>• Freehand drawing</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-medium">Navigation:</h4>
              <ul className="space-y-1">
                <li>• Pan: Click and drag empty space</li>
                <li>• Zoom: Mouse wheel or zoom controls</li>
                <li>• Select: Click on elements</li>
                <li>• Multi-select: Ctrl/Cmd + click</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
