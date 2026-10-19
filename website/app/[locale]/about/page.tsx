import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { AboutPage } from "../../../components/editorial-pages"; import { isLocale, localeStaticParams, type LocalizedLocale } from "../../../lib/i18n"; import { pageMetadata } from "../../../lib/seo";
type Props={params:Promise<{locale:string}>}; export function generateStaticParams(){return localeStaticParams()};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{locale}=await params;if(!isLocale(locale)||locale==="en")return{};return pageMetadata({locale,path:"/about",...aboutMetadata[locale]})}
const aboutMetadata:Record<LocalizedLocale,{title:string;description:string}>={
  ro:{title:"Despre noi",description:"Principiile de produs, inginerie și cercetare din spatele 360Configurator."},
  de:{title:"Über uns",description:"Produktdenken, technische Prinzipien und Forschung hinter 360Configurator."},
  es:{title:"Quiénes somos",description:"Los principios de producto, ingeniería e investigación detrás de 360Configurator."},
  fr:{title:"À propos",description:"Les principes produit, d’ingénierie et de recherche derrière 360Configurator."},
  it:{title:"Chi siamo",description:"I principi di prodotto, ingegneria e ricerca alla base di 360Configurator."},
};
export default async function Page({params}:Props){const{locale}=await params;if(!isLocale(locale)||locale==="en")notFound();return <AboutPage locale={locale}/>}
