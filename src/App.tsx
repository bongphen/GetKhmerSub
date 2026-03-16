/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  FileAudio, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Languages,
  FileDown,
  ChevronRight
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';
import { cn } from './lib/utils';

// --- Types ---

interface SubtitleFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  result?: string;
  error?: string;
  detectedLanguage?: string;
}

// --- Constants ---

const GEMINI_MODEL = "gemini-3-flash-preview";

export default function App() {
  const [files, setFiles] = useState<SubtitleFile[]>([]);
  const [translateToKhmer, setTranslateToKhmer] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const generateSubtitle = async (item: SubtitleFile) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    
    try {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing', progress: 10 } : f));

      const base64Audio = await fileToBase64(item.file);
      
      const prompt = translateToKhmer 
        ? "Transcribe this audio into SRT subtitle format. Auto-detect the source language and then translate the subtitles into Khmer language. Return ONLY the SRT content."
        : "Transcribe this audio into SRT subtitle format. Auto-detect the source language. Return ONLY the SRT content.";

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: item.file.type || "audio/mpeg",
                  data: base64Audio
                }
              }
            ]
          }
        ]
      });

      const srtContent = response.text || "";
      
      setFiles(prev => prev.map(f => f.id === item.id ? { 
        ...f, 
        status: 'completed', 
        result: srtContent,
        progress: 100 
      } : f));

    } catch (error: any) {
      console.error("Transcription error:", error);
      setFiles(prev => prev.map(f => f.id === item.id ? { 
        ...f, 
        status: 'error', 
        error: error.message || "Failed to process audio" 
      } : f));
    }
  };

  // --- Handlers ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'pending' as const,
        progress: 0
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    
    // Process sequentially to avoid hitting rate limits too hard, 
    // though parallel is possible if limits allow.
    for (const file of pendingFiles) {
      await generateSubtitle(file);
    }
    setIsProcessingAll(false);
  };

  const downloadSingle = (item: SubtitleFile) => {
    if (!item.result) return;
    const blob = new Blob([item.result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = item.file.name.replace(/\.[^/.]+$/, "") + ".srt";
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadBatch = async () => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.result);
    if (completedFiles.length === 0) return;

    const zip = new JSZip();
    completedFiles.forEach(item => {
      const fileName = item.file.name.replace(/\.[^/.]+$/, "") + ".srt";
      zip.file(fileName, item.result!);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = "subtitles_batch.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files).map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'pending' as const,
        progress: 0
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <Languages size={20} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">AudioSub</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                translateToKhmer ? "bg-emerald-500" : "bg-gray-300"
              )}>
                <div className={cn(
                  "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                  translateToKhmer ? "translate-x-5" : "translate-x-0"
                )} />
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={translateToKhmer}
                onChange={() => setTranslateToKhmer(!translateToKhmer)}
              />
              <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
                Translate to Khmer
              </span>
            </label>
            
            {files.length > 0 && (
              <button 
                onClick={processAll}
                disabled={isProcessingAll || files.every(f => f.status === 'completed')}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
              >
                {isProcessingAll ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                Process All
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Upload Area */}
        <div 
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            multiple 
            accept="audio/*" 
            className="hidden" 
          />
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload size={32} />
          </div>
          <h2 className="text-xl font-medium mb-1">Drop audio files here</h2>
          <p className="text-gray-500 text-sm">or click to browse from your computer</p>
          <p className="text-xs text-gray-400 mt-4 uppercase tracking-widest font-semibold">Supports MP3, WAV, M4A, AAC</p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Files <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md text-xs">{files.length}</span>
              </h3>
              {files.some(f => f.status === 'completed') && (
                <button 
                  onClick={downloadBatch}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1.5"
                >
                  <FileDown size={16} />
                  Download All (ZIP)
                </button>
              )}
            </div>

            <div className="grid gap-3">
              {files.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white border border-black/5 rounded-xl p-4 flex items-center justify-between group animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      item.status === 'completed' ? "bg-emerald-50 text-emerald-500" : 
                      item.status === 'error' ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-400"
                    )}>
                      <FileAudio size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate pr-4">{item.file.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                          {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        {item.status === 'processing' && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="animate-spin text-emerald-500" size={12} />
                            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Processing...</span>
                          </div>
                        )}
                        {item.status === 'completed' && (
                          <div className="flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Ready</span>
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="flex items-center gap-1 text-red-500">
                            <AlertCircle size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Error</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {item.status === 'completed' && (
                      <button 
                        onClick={() => downloadSingle(item)}
                        className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Download SRT"
                      >
                        <Download size={18} />
                      </button>
                    )}
                    {item.status !== 'processing' && (
                      <button 
                        onClick={() => removeFile(item.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Remove"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && (
          <div className="mt-24 text-center max-w-sm mx-auto">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
              <FileAudio size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No files uploaded yet</h3>
            <p className="text-gray-500 text-sm mt-2">
              Upload audio files to start generating subtitles. You can process them all at once and translate them to Khmer.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-black/5 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
            Powered by Gemini AI • SRT Export
          </p>
          <div className="flex items-center gap-6 text-xs text-gray-400 font-medium">
            <span className="hover:text-gray-600 cursor-default">Privacy</span>
            <span className="hover:text-gray-600 cursor-default">Terms</span>
            <span className="hover:text-gray-600 cursor-default">Help</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
