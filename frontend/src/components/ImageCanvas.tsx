// src/components/ImageCanvas.tsx
import React, { useEffect, useRef } from "react";
import type { Detection } from "../api/types";

type Props = {
  src: string;
  naturalSize?: { w: number; h: number };
  detections?: Detection[];
  confPercent: number;       // 0..100
  drawBoxes: boolean;
  drawLabels: boolean;
  maxSize?: { w: number; h: number };
};

const ImageCanvas: React.FC<Props> = ({
  src, naturalSize, detections = [],
  confPercent, drawBoxes, drawLabels,
  maxSize = { w: 1000, h: 700 }
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const cw = Math.min(maxSize.w, img.width);
      const ch = Math.min(maxSize.h, Math.round((img.height / img.width) * cw));
      const canvas = ref.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = cw;
      canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);

      if (!drawBoxes && !drawLabels) return;

      const confThr = confPercent / 100;
      const baseW = naturalSize?.w ?? img.width;
      const baseH = naturalSize?.h ?? img.height;
      const sx = cw / baseW;
      const sy = ch / baseH;

      detections
        .filter(d => d.confidence >= confThr)
        .forEach(d => {
          const [x1, y1, x2, y2] = d.bbox_xyxy;
          const rx = Math.round(x1 * sx);
          const ry = Math.round(y1 * sy);
          const rw = Math.round((x2 - x1) * sx);
          const rh = Math.round((y2 - y1) * sy);

          if (drawBoxes) {
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);
          }
          if (drawLabels) {
            const label = `${d.class_name} ${(d.confidence * 100).toFixed(0)}%`;
            ctx.font = "14px Inter, system-ui, sans-serif";
            const pad = 6;
            const tw = Math.ceil(ctx.measureText(label).width) + pad * 2;
            const th = 20;
            ctx.fillStyle = "rgba(34,197,94,.9)";
            ctx.fillRect(rx, Math.max(0, ry - th), tw, th);
            ctx.fillStyle = "#fff";
            ctx.fillText(label, rx + pad, Math.max(14, ry - 6));
          }
        });
    };
    img.src = src;
  }, [src, detections, confPercent, drawBoxes, drawLabels, maxSize.w, maxSize.h, naturalSize?.w, naturalSize?.h]);

  return <canvas ref={ref} style={{ width: "100%", height: "auto", borderRadius: 12 }} />;
};

export default ImageCanvas;
