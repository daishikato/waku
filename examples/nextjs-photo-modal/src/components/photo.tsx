'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'waku';
import { hasHydrated } from './navigation-state';

export const Photo = ({ id }: { id: string }) => {
  // Read during render, before any effect has run: on the initial load this is
  // false, and on a navigation from the feed it is true. Kept in state so that
  // the choice never changes underneath an open modal.
  const [asModal] = useState(hasHydrated);

  if (!asModal) {
    return (
      <div className="card" data-standalone>
        {id}
      </div>
    );
  }

  return <Modal>{id}</Modal>;
};

const Modal = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, []);

  const onDismiss = () => {
    router.back();
  };

  return createPortal(
    <div className="modal-backdrop">
      <dialog ref={dialogRef} className="modal" onClose={onDismiss}>
        {children}
        <button onClick={onDismiss} className="close-button" />
      </dialog>
    </div>,
    document.getElementById('modal-root')!,
  );
};
