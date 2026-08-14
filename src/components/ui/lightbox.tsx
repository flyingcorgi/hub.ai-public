"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Download, X, Trash2 } from "lucide-react";

export interface LightboxProps {
  children?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  contentType?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  onDownload?: () => void;
  onDelete?: () => void;
  isNSFW?: boolean;
  onNSFWToggle?: (isNSFW: boolean) => void;
}

export function Lightbox({
  children,
  isOpen,
  onClose,
  imageUrl,
  contentType,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  onDownload,
  onDelete,
  isNSFW,
  onNSFWToggle,
}: LightboxProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-screen-lg w-full h-[90vh] p-0 gap-0">
        <div className="relative h-full flex flex-col">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-50 flex justify-between items-center p-4 bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex items-center gap-4">
              {onNSFWToggle && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="nsfw"
                    checked={isNSFW}
                    onCheckedChange={onNSFWToggle}
                  />
                  <Label htmlFor="nsfw" className="text-white">NSFW</Label>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onDownload && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white"
                  onClick={onDownload}
                >
                  <Download className="h-4 w-4" />
                  <span className="sr-only">Download image</span>
                </Button>
              )}
              {onDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 bg-black/20 hover:bg-red-500/40 backdrop-blur-[2px] text-white"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete image</span>
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close lightbox</span>
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="relative h-full">
              {contentType?.startsWith("video/") ? (
                <video
                  src={imageUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : (
                <img
                  src={imageUrl}
                  alt="Lightbox image"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
              
              {/* Navigation Buttons */}
              <div className="absolute inset-0 flex items-center justify-between p-4">
                {hasPrevious && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white"
                    onClick={onPrevious}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous image</span>
                  </Button>
                )}
                {hasNext && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white ml-auto"
                    onClick={onNext}
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next image</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Info Panel */}
          {children && (
            <div className="bg-background border-t p-4">
              {children}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 