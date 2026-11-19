import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerSettingsQueryKey,
  putOwnerQrisImage,
} from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";

/** Gambar QRIS: yang terpasang sekarang, pilih berkas baru dengan pratinjau, unggah, galat server. */
export function QrisUpload({ currentUrl }: { currentUrl: string }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [brokenCurrent, setBrokenCurrent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Klien hasil generate selalu mengirim image/png; server mencocokkan Content-Type dengan isi berkas.
  const upload = useMutation({
    mutationFn: (image: File) =>
      putOwnerQrisImage(image, { headers: { "Content-Type": image.type } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(getGetOwnerSettingsQueryKey(), saved);
      toast.success("Gambar QRIS disimpan");
      setFile(null);
      setBrokenCurrent(false);
      if (input.current) input.current.value = "";
    },
  });

  useEffect(() => {
    if (file === null) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="grid gap-2">
      <p className="text-[15px] font-semibold">Gambar QRIS</p>
      <div className="flex items-start gap-3">
        <div className="grid gap-1 text-center text-[12px] text-muted">
          {currentUrl && !brokenCurrent ? (
            <img
              src={currentUrl}
              alt="Gambar QRIS terpasang"
              onError={() => setBrokenCurrent(true)}
              className="size-24 rounded-md border border-border object-contain"
            />
          ) : (
            <span className="grid size-24 place-items-center rounded-md border border-border">
              <ImageOff aria-hidden="true" className="size-6" />
            </span>
          )}
          <span>Terpasang</span>
        </div>
        {preview !== null && (
          <div className="grid gap-1 text-center text-[12px] text-muted">
            <img
              src={preview}
              alt="Pratinjau gambar QRIS baru"
              className="size-24 rounded-md border border-primary object-contain"
            />
            <span>Baru</span>
          </div>
        )}
      </div>
      <label htmlFor="qris-berkas" className="text-[13px] text-muted">
        Pilih gambar QRIS
      </label>
      <input
        ref={input}
        id="qris-berkas"
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Pilih gambar QRIS"
        onChange={(e) => {
          upload.reset();
          setFile(e.target.files?.[0] ?? null);
        }}
        className="min-h-11 text-[14px] file:mr-3 file:h-11 file:rounded-md file:border file:border-border file:bg-bg file:px-3 file:text-[15px] file:font-semibold"
      />
      <p className="text-[13px] text-muted">
        PNG atau JPEG, paling besar 1 MB.
      </p>
      {upload.isError && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {pesanError(upload.error)}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={file === null || upload.isPending}
        className="h-12 w-full text-[17px]"
        onClick={() => {
          if (file) upload.mutate(file);
        }}
      >
        Unggah gambar QRIS
      </Button>
    </div>
  );
}
