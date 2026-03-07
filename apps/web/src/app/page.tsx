'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useRef } from 'react';
import { useI18n } from '@/utils/i18n';

export default function UploadPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      setError(null);
      if (!acceptedTypes.includes(file.type)) {
        setError(t('upload.error.type'));
        return;
      }
      if (file.size > maxFileSize) {
        setError(t('upload.error.size'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          sessionStorage.setItem('uploadedImage', reader.result as string);
        } catch {
          setError(t('upload.error.storage'));
          return;
        }
        router.push('/editor');
      };
      reader.readAsDataURL(file);
    },
    [router, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] px-4">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-3xl font-bold mb-2">{t('upload.title')}</h1>
        <p className="text-zinc-500 mb-8">{t('upload.subtitle')}</p>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-12 cursor-pointer transition-all
            ${isDragging ? 'border-accent bg-accent/5 scale-[1.02]' : 'border-border hover:border-accent/50'}
          `}
        >
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-12 h-12 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="font-medium">{t('upload.drop')}</p>
            <p className="text-sm text-zinc-400">{t('upload.formats')}</p>
          </div>
        </div>

        {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    </main>
  );
}
