import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !exiting) {
      setRevealed(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setRevealed(true));
      });
      return () => cancelAnimationFrame(id);
    }
    if (!isOpen) {
      setRevealed(false);
      setExiting(false);
    }
  }, [isOpen, exiting]);

  const handleCloseClick = () => {
    if (exiting) return;
    setExiting(true);
  };

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.target !== backdropRef.current) return;
    if (exiting) {
      setExiting(false);
      onClose();
    }
  };

  if (!isOpen && !exiting) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-200 ease-out"
      style={{ opacity: revealed && !exiting ? 1 : 0 }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        className="bg-gray-900 border border-gray-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-[opacity,transform] duration-200 ease-out"
        style={{
          opacity: revealed && !exiting ? 1 : 0,
          transform: revealed && !exiting ? 'scale(1)' : 'scale(0.95)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={handleCloseClick} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
