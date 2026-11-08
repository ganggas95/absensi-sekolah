import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

const MANAGED_PHOTO_PATH = /^\/management\/students\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StudentPhotoProps = {
  photoUrl?: string | null;
  file?: File | null;
  className: string;
  alt: string;
  fallback: ReactNode;
};

export default function StudentPhoto({ photoUrl, file, className, alt, fallback }: StudentPhotoProps) {
  const [fileUrl, setFileUrl] = useState("");
  const [savedPhotoUrl, setSavedPhotoUrl] = useState("");
  const managedPhotoUrl = photoUrl && MANAGED_PHOTO_PATH.test(photoUrl) ? photoUrl : null;
  const photo = useQuery<Blob>({
    queryKey: ["student-photo", managedPhotoUrl],
    queryFn: async () => (await api.get(managedPhotoUrl!, { responseType: "blob" })).data,
    enabled: Boolean(managedPhotoUrl && !file),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!file) {
      setFileUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!photo.data) {
      setSavedPhotoUrl("");
      return;
    }
    const url = URL.createObjectURL(photo.data);
    setSavedPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.data]);
  const imageUrl = fileUrl || savedPhotoUrl;

  return imageUrl
    ? <img className={className} src={imageUrl} alt={alt} />
    : fallback;
}
