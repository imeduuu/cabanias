import { Header, Footer } from "@/components/public-shell";
export default function PublicLayout({children}: {children: React.ReactNode}) { return <><Header/>{children}<Footer/></>; }
