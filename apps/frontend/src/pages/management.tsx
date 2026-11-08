import {useEffect} from "react";
import {useRouter} from "next/router";

export default function ManagementIndex() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/management/academic-years");
    }, [router]);
    return (
        <main className="page-loading flex min-h-screen items-center justify-center gap-2">
            <div className="loading-spinner"/>
            <span>Membuka Master Data...</span>
        </main>);
}
