import React, { useState } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectBox,
} from '../components/ui/select';
import {
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Shield,
  Layers,
  Code2,
} from 'lucide-react';

export const SelectShowcase: React.FC = () => {
  // State for demonstrations
  const [compoundVal, setCompoundVal] = useState('react');
  const [taskStatus, setTaskStatus] = useState('IN_PROGRESS');
  const [priority, setPriority] = useState('HIGH');
  const [sizeSmall, setSizeSmall] = useState('compact');
  const [sizeLarge, setSizeLarge] = useState('expanded');

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: '9999px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            <Sparkles size={14} />
            <span>Design System Primitives</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Shadcn / UI Select & Dropdown Components
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Fully accessible, keyboard navigable select dropdowns styled with dark glassmorphism and smooth spring motion.
          </p>
        </div>

        {/* Grid of Examples */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          
          {/* 1. Compound Components */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Code2 size={18} style={{ color: 'var(--accent-primary, #6366f1)' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                Compound Components (Standard Shadcn)
              </h3>
            </div>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-tertiary, #94a3b8)', marginBottom: '1.25rem' }}>
              Built using <code>Select</code>, <code>SelectTrigger</code>, <code>SelectValue</code>, and <code>SelectContent</code> with Radix UI under the hood.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
                Frontend Framework
              </label>
              <Select value={compoundVal} onValueChange={setCompoundVal}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a technology" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Modern Web Stack</SelectLabel>
                    <SelectItem value="react">React 19 (Concurrent)</SelectItem>
                    <SelectItem value="nextjs">Next.js App Router</SelectItem>
                    <SelectItem value="vite">Vite 8 Rolldown</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Styles & UI</SelectLabel>
                    <SelectItem value="shadcn">Shadcn / UI Components</SelectItem>
                    <SelectItem value="tailwind">Tailwind CSS v4</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.35)', borderRadius: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
              Selected value: <strong style={{ color: '#a5b4fc' }}>{compoundVal}</strong>
            </div>
          </div>

          {/* 2. High-Level DropdownSelect / SelectBox */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Zap size={18} style={{ color: '#38bdf8' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                High-Level SelectBox
              </h3>
            </div>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-tertiary, #94a3b8)', marginBottom: '1.25rem' }}>
              Fast single-tag declaration with automatic empty sentinel handling and option normalization.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <SelectBox
                label="Task Status"
                value={taskStatus}
                onValueChange={setTaskStatus}
                options={[
                  { value: 'TODO', label: 'To Do', icon: <Clock size={14} color="#94a3b8" /> },
                  { value: 'IN_PROGRESS', label: 'In Progress', icon: <Zap size={14} color="#38bdf8" /> },
                  { value: 'IN_REVIEW', label: 'In Review', icon: <Layers size={14} color="#f59e0b" /> },
                  { value: 'DONE', label: 'Completed', icon: <CheckCircle2 size={14} color="#10b981" /> },
                ]}
              />
            </div>

            <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.35)', borderRadius: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
              Current Status: <strong style={{ color: '#38bdf8' }}>{taskStatus}</strong>
            </div>
          </div>

          {/* 3. Sizes & Variants */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Layers size={18} style={{ color: '#10b981' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                Size Variations
              </h3>
            </div>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-tertiary, #94a3b8)', marginBottom: '1.25rem' }}>
              Supports <code>size="sm"</code> (compact headers & tables), <code>size="md"</code> (default), and <code>size="lg"</code> (hero forms).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Small (30px)</span>
                <SelectBox
                  size="sm"
                  value={sizeSmall}
                  onValueChange={setSizeSmall}
                  options={[
                    { value: 'compact', label: 'Compact Layout' },
                    { value: 'dense', label: 'Dense Grid' },
                  ]}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Large (44px)</span>
                <SelectBox
                  size="lg"
                  value={sizeLarge}
                  onValueChange={setSizeLarge}
                  options={[
                    { value: 'expanded', label: 'Expanded Layout Mode' },
                    { value: 'spacious', label: 'Spacious Presentation' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* 4. Priority & Disabled States */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Shield size={18} style={{ color: '#f59e0b' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                Options & Disabled States
              </h3>
            </div>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-tertiary, #94a3b8)', marginBottom: '1.25rem' }}>
              Items can be individually disabled or the entire select trigger can be locked.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SelectBox
                label="Priority Level"
                value={priority}
                onValueChange={setPriority}
                options={[
                  { value: 'LOW', label: 'Low Priority' },
                  { value: 'MEDIUM', label: 'Medium Priority' },
                  { value: 'HIGH', label: 'High Priority' },
                  { value: 'URGENT', label: 'Urgent (Emergency)', disabled: false },
                  { value: 'ARCHIVED', label: 'Archived (Locked)', disabled: true },
                ]}
              />

              <div>
                <label className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
                  Locked Organization Role
                </label>
                <SelectBox
                  disabled
                  defaultValue="owner"
                  options={[{ value: 'owner', label: 'Workspace Owner (Immutable)' }]}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Feature Highlights Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: '#ffffff', fontSize: '0.95rem', fontWeight: 600 }}>
              Production Shadcn/UI Select Architecture
            </h4>
            <p style={{ margin: '0.25rem 0 0', color: '#cbd5e1', fontSize: '0.8125rem' }}>
              Exported from <code>@/components/ui/select</code> with TypeScript definitions, Radix UI Portal popovers, and Sileo theme styling.
            </p>
          </div>
        </div>
      </div>
  );
};

export default SelectShowcase;
