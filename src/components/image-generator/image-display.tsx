import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Image } from "@/lib/types";

interface ImageDisplayProps {
  result: Image | null;
  forceVideo?: boolean;
  isGenerating?: boolean;
  canNavigate?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function ImageDisplay({
  result,
  forceVideo,
  isGenerating,
  canNavigate,
  onPrevious,
  onNext,
}: ImageDisplayProps) {
  const isVideo = forceVideo || result?.content_type?.startsWith("video/");

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{isVideo ? "Generated Video" : "Generated Image"}</CardTitle>
          <CardDescription>
            {isVideo
              ? "Your AI-generated video will appear here"
              : "Your AI-generated artwork will appear here"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {canNavigate && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onPrevious}
                disabled={!onPrevious}
                title="Previous result"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onNext}
                disabled={!onNext}
                title="Next result"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {result && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(result.url, '_blank')}
              title={isVideo ? "Open Video" : "Download Image"}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {result ? (
          isVideo ? (
            <video
              src={result.url}
              controls
              className="rounded-lg w-full object-contain max-h-[480px]"
            />
          ) : (
            <img 
              src={result.url} 
              alt="Generated image"
              width={result.width}
              height={result.height}
              className="rounded-lg w-full object-cover"
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] bg-muted rounded-lg space-y-3">
            {isGenerating ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Generating…</p>
              </>
            ) : (
              <p className="text-muted-foreground">No media generated yet</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}