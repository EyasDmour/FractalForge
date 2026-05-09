import { useRef, useState, useEffect } from 'react';

// Returns [ref, visible]. Attach ref to the container element.
// visible goes true when the element is within rootMargin of the viewport.
export function useVisible(rootMargin = '300px') {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return [ref, visible];
}
