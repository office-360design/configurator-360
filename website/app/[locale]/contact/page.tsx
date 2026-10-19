import type { Metadata } from "next"; import { notFound } from "next/navigation"; import { ContactPage } from "../../../components/editorial-pages"; import { isLocale, localeStaticParams, type LocalizedLocale } from "../../../lib/i18n"; import { pageMetadata } from "../../../lib/seo";
type Props={params:Promise<{locale:string}>}; export function generateStaticParams(){return localeStaticParams()};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{locale}=await params;if(!isLocale(locale)||locale==="en")return{};return pageMetadata({locale,path:"/contact",...contactMetadata[locale]})}
const contactMetadata:Record<LocalizedLocale,{title:string;description:string}>={
  ro:{title:"Contact",description:"Discută cu 360Configurator despre un configurator spațial 3D personalizat."},
  de:{title:"Kontakt",description:"Sprechen Sie mit 360Configurator über einen individuellen räumlichen 3D-Konfigurator."},
  es:{title:"Contacto",description:"Hable con 360Configurator sobre un configurador espacial 3D a medida."},
  fr:{title:"Contact",description:"Échangez avec 360Configurator sur un configurateur spatial 3D sur mesure."},
  it:{title:"Contatti",description:"Parli con 360Configurator di un configuratore spaziale 3D su misura."},
};
export default async function Page({params}:Props){const{locale}=await params;if(!isLocale(locale)||locale==="en")notFound();return <ContactPage locale={locale}/>}
