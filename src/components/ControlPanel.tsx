"use client";

import type { TrackerConfig } from "@/lib/tracker-types";
import Icon from "./Icon";

interface ControlsProps {
  config: Partial<TrackerConfig>;
  disabled: boolean;
  onChange: (config: Partial<TrackerConfig>) => void;
  onReset: () => void;
}

export default function ControlPanel({ config, disabled, onChange, onReset }: ControlsProps) {
  return (
    <details className="inspector-panel settings-panel">
      <summary><Icon name="settings" /> <span>跟踪设置</span><Icon name="chevron" className="details-chevron" /></summary>
      <div className="inspector-body">
        <label className="slider-field">
          <span>人物大小 <output>{Math.round((config.targetVerticalRatio ?? 0.6) * 100)}%</output></span>
          <input type="range" min="0.3" max="0.8" step="0.05" value={config.targetVerticalRatio ?? 0.6}
            disabled={disabled} onChange={(event) => onChange({ targetVerticalRatio: event.currentTarget.valueAsNumber })} />
        </label>
        <label className="slider-field">
          <span>镜头跟随速度 <output>{(config.smoothingFactor ?? 0.04).toFixed(2)}</output></span>
          <input type="range" min="0.01" max="0.15" step="0.01" value={config.smoothingFactor ?? 0.04}
            disabled={disabled} onChange={(event) => onChange({ smoothingFactor: event.currentTarget.valueAsNumber })} />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={(config.dynoPadding ?? 1) > 0} disabled={disabled}
            onChange={(event) => onChange({ dynoPadding: event.currentTarget.checked ? 1 : 0 })} />
          大幅动作时放宽取景
        </label>
        <details className="advanced-settings">
          <summary>高级参数 <Icon name="chevron" className="details-chevron" /></summary>
          <label className="slider-field">
            <span>取景垂直偏移 <output>{(config.verticalCenterBias ?? 0.55).toFixed(2)}</output></span>
            <input type="range" min="0.3" max="0.7" step="0.05" value={config.verticalCenterBias ?? 0.55}
              disabled={disabled} onChange={(event) => onChange({ verticalCenterBias: event.currentTarget.valueAsNumber })} />
          </label>
          <label className="slider-field">
            <span>识别阈值 <output>{(config.confidenceThreshold ?? 0.25).toFixed(2)}</output></span>
            <input type="range" min="0.1" max="0.6" step="0.05" value={config.confidenceThreshold ?? 0.25}
              disabled={disabled} onChange={(event) => onChange({ confidenceThreshold: event.currentTarget.valueAsNumber })} />
          </label>
          <label className="slider-field">
            <span>遮挡判断敏感度 <output>{(config.areaJumpThreshold ?? 2.5).toFixed(1)}×</output></span>
            <input type="range" min="1.5" max="5" step="0.5" value={config.areaJumpThreshold ?? 2.5}
              disabled={disabled} onChange={(event) => onChange({ areaJumpThreshold: event.currentTarget.valueAsNumber })} />
          </label>
        </details>
        <button className="button button-quiet" type="button" onClick={onReset} disabled={disabled}>恢复默认设置</button>
      </div>
    </details>
  );
}
