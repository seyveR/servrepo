// src/components/ThumbStrip.tsx
import React from "react";
import { IconButton, Stack } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

type Props = {
  urls: string[];
  current: number;
  onSelect: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

const ThumbStrip: React.FC<Props> = ({ urls, current, onSelect, onPrev, onNext }) => {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <IconButton onClick={onPrev} disabled={current <= 0}><ChevronLeftIcon /></IconButton>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "6px 4px" }}>
        {urls.map((u, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            style={{
              width: 84, height: 64, borderRadius: 10, overflow: "hidden",
              border: i === current ? "2px solid #1976d2" : "1px solid #e5e7eb",
              padding: 0, background: "transparent", cursor: "pointer"
            }}
            title={`Фото ${i + 1}`}
          >
            <img src={u} alt={`thumb-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
      </div>
      <IconButton onClick={onNext} disabled={current >= urls.length - 1}><ChevronRightIcon /></IconButton>
    </Stack>
  );
};

export default ThumbStrip;
