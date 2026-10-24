import { useState } from 'react'
import type { Frame } from '../../shared/types'
import { downloadFrameExport, type ExportScale, type FrameExportFormat } from '../lib/frameExport'
import { Button } from './ui/button'
import { Modal, ModalActions, ModalLede, ModalTitle } from './ui/modal'
import { Segmented, SegmentedItem } from './ui/segmented'

export function FrameExportModal({ frame, onClose }: { frame: Frame; onClose: () => void }) {
  const [scale, setScale] = useState<ExportScale>(2)

  function download(format: FrameExportFormat) {
    void downloadFrameExport(frame, format, scale)
    onClose()
  }

  return (
    <Modal size="sm" onClose={onClose}>
      <ModalTitle className="break-words">Export “{frame.name}”</ModalTitle>
      <ModalLede>Download this frame as an image, as a vector PDF, or as its HTML.</ModalLede>
      <Segmented
        aria-label="Image scale"
        value={String(scale)}
        onValueChange={(v) => setScale(Number(v) as ExportScale)}
        className="mt-5"
      >
        <SegmentedItem value="1">1×</SegmentedItem>
        <SegmentedItem value="2">2×</SegmentedItem>
        <SegmentedItem value="3">3×</SegmentedItem>
      </Segmented>
      <div className="mt-3 grid gap-2">
        <Button variant="ghost" className="justify-start" onClick={() => download('png')}>
          Download PNG
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => download('jpg')}>
          Download JPG
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => download('pdf')}>
          Download PDF
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => download('html')}>
          Download HTML
        </Button>
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </ModalActions>
    </Modal>
  )
}
