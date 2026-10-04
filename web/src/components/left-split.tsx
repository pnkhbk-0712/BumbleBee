import { useRef, useState, useEffect } from 'react';

type LeftSplitProps = {
  left: React.ReactNode;
  right: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
};

export default function LeftSplit({
  left,
  right,
  minWidth = 240,
  maxWidth = 480,
  defaultWidth = 320,
}: LeftSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(defaultWidth);
  const isDragging = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setLeftWidth(newWidth);
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minWidth, maxWidth]);

  return (
    <main
      ref={containerRef}
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* LEFT */}
      <aside
        style={{
          width: leftWidth,
          minWidth,
          maxWidth,
          overflow: 'auto',
          borderRight: '1px solid #ddd',
        }}
      >
        {left}
      </aside>

      {/* RESIZE HANDLE */}
      <div
        onMouseDown={() => {
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
        }}
        style={{
          width: 6,
          cursor: 'col-resize',
          background: '#f0f0f0',
        }}
      />

      {/* RIGHT */}
      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {right}
      </section>
    </main>
  );
}
