// export type BBox = [number, number, number, number];

// type Detection = {
//   class_id: number;
//   class_name: string;         // EN
//   class_name_ru?: string;     // RU (с бэка)
//   confidence: number;         // 0..1
//   bbox_xyxy: [number, number, number, number];
// };

// export type Summary = {
//   all_tools_present: boolean;
//   missing_tools: string[];
//   extras_or_duplicates: string[];
//   min_confidence: number;   // 0..1
//   manual_check_required: boolean;
// };

// export type InferenceResponse = {
//   image_width: number;
//   image_height: number;
//   detections: Detection[];
//   summary: Summary;
//   original_url?: string;    // /static/original/xxx.jpg
//   processed_url?: string;   // /static/processed/xxx.jpg
// };

// Детекция
export type BBox = [number, number, number, number];

export type Detection = {
  class_id: number;
  class_name: string;
  class_name_ru?: string;
  confidence: number; // 0..1
  bbox_xyxy: BBox; // pixels
};

export type Summary = {
  all_tools_present: boolean;
  missing_tools: string[];
  extras_or_duplicates: string[];
  min_confidence: number; // 0..1
  manual_check_required: boolean;
};

export type InferenceResponse = {
  audit_id?: number;
  image_width: number;
  image_height: number;
  detections: Detection[];
  summary: Summary;
  original_url?: string;
  processed_url?: string;
};

// Аудит
export type AuditRow = {
  id: number;
  employee_id: string;
  created_at: string; // "YYYY-MM-DD HH:mm:ss"
  total_detections: number;
  all_tools_present: boolean;
  min_confidence: number;
  manual_check_required: boolean;
  report_url?: string;
};

export type AuditListResponse = {
  total: number;
  page: number;
  size: number;
  items: AuditRow[];
};

// Экспорт
export type ExportRequest = {
  date?: string | null;
  page_from?: number | null;
  page_to?: number | null;
  size?: number; // default 20
  status?: "all" | "needed" | "not_needed";
  employees?: string[] | null;
  employee_search?: string | null;
};
