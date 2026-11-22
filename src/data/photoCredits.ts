/**
 * Photo credits for the fleet images in public/images/fleet. All are freely licensed photos from
 * Wikimedia Commons; CC BY / CC BY-SA require this attribution to be shown. Replace with photos of
 * your own vehicles before launch (and remove the entries).
 */
export interface PhotoCredit {
  author: string;
  license: string;
  source: string;
  title: string;
}

export const PHOTO_CREDITS: Record<string, PhotoCredit> = {
  "/images/fleet/toyota-prado.jpg": {
    "author": "Ethan Llamas",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:2025_Toyota_Land_Cruiser_Prado_250_2.4_Turbo_in_White_Pearl_Mica,_front_left.jpg",
    "title": "2025 Toyota Land Cruiser Prado 250 2.4 Turbo in White Pearl Mica, front left.jpg"
  },
  "/images/fleet/lexus-gx460.jpg": {
    "author": "Gold Pony",
    "license": "CC BY 3.0",
    "source": "https://commons.wikimedia.org/wiki/File:2022_Lexus_GX_460.jpg",
    "title": "2022 Lexus GX 460.jpg"
  },
  "/images/fleet/mercedes-gle450.jpg": {
    "author": "Charles from Port Chester, New York",
    "license": "CC0",
    "source": "https://commons.wikimedia.org/wiki/File:Mercedes-Benz_GLE_450_4MATIC_(W167,_2026)_(55211989821).jpg",
    "title": "Mercedes-Benz GLE 450 4MATIC (W167, 2026) (55211989821).jpg"
  },
  "/images/fleet/cadillac-escalade.jpg": {
    "author": "Mr.choppers",
    "license": "CC BY-SA 3.0",
    "source": "https://commons.wikimedia.org/wiki/File:2021_Cadillac_Escalade_ESV_4WD_Premium_Luxury_in_Satin_Steel_Metallic,_front_right.jpg",
    "title": "2021 Cadillac Escalade ESV 4WD Premium Luxury in Satin Steel Metallic, front right.jpg"
  },
  "/images/fleet/toyota-lc300.jpg": {
    "author": "Captainmorlypogi1959",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:Toyota_Land_Cruiser_300_4x4_VXR_2022_(2).jpg",
    "title": "Toyota Land Cruiser 300 4x4 VXR 2022 (2).jpg"
  },
  "/images/fleet/cadillac-escalade-2025.jpg": {
    "author": "Calreyn88",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:Cadillac_Escalade_3_sp25.jpg",
    "title": "Cadillac Escalade 3 sp25.jpg"
  },
  "/images/fleet/toyota-rav4.jpg": {
    "author": "Dinkun Chen",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:TOYOTA_RAV4_(XA50)_China_(9).jpg",
    "title": "TOYOTA RAV4 (XA50) China (9).jpg"
  },
  "/images/fleet/chevrolet-tahoe.jpg": {
    "author": "Alexander-93",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:Chevrolet_Tahoe_(GMTT1XX)_1X7A6671.jpg",
    "title": "Chevrolet Tahoe (GMTT1XX) 1X7A6671.jpg"
  },
  "/images/fleet/mercedes-vclass.jpg": {
    "author": "Abrimaal",
    "license": "CC BY-SA 3.0",
    "source": "https://commons.wikimedia.org/wiki/File:Mercedes_benz_w447_v250_(2014)_grey.jpg",
    "title": "Mercedes benz w447 v250 (2014) grey.jpg"
  },
  "/images/fleet/toyota-hilux.jpg": {
    "author": "Chanokchon",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:2024_Toyota_Hilux_Revo_GR_Sport_Double-Cab_2.8_4x4.jpg",
    "title": "2024 Toyota Hilux Revo GR Sport Double-Cab 2.8 4x4.jpg"
  },
  "/images/fleet/toyota-granvia.jpg": {
    "author": "JustAnotherCarDesigner",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:Toyota_Granvia_002.jpg",
    "title": "Toyota Granvia 002.jpg"
  }
};
