/**
 * Interactive Beverly Hills location map for Elara Atelier using @vis.gl/react-google-maps.
 * Renders zoom, Map/Satellite view, Street View, and fullscreen controls alongside an
 * anchored AdvancedMarker InfoWindow, with a clean fallback when no API key is configured.
 * Terms of Service: https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */

import React, { useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { ExternalLink } from 'lucide-react';
import { CLINIC_COLORS, CLINIC_CONFIG } from '../../config/clinicConfig';

interface StudioMarkerProps {
  position: { lat: number; lng: number };
}

/**
 * Renders the branded AdvancedMarker pin and click-anchored InfoWindow for the clinic.
 * Inputs: position LatLngLiteral coordinates.
 * Output: React fragment with AdvancedMarker and conditional InfoWindow.
 */
const StudioLocationMarker: React.FC<StudioMarkerProps> = ({ position }) => {
  const [infoWindowOpen, setInfoWindowOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        title={`${CLINIC_CONFIG.brandName} · ${CLINIC_CONFIG.addressLine2}`}
        onClick={() => setInfoWindowOpen(prev => !prev)}
      >
        <Pin
          background={CLINIC_COLORS.espresso}
          borderColor={CLINIC_COLORS.champagne}
          glyphColor={CLINIC_COLORS.ivory}
          scale={1.15}
        />
      </AdvancedMarker>

      {infoWindowOpen && marker ? (
        <InfoWindow
          anchor={marker}
          maxWidth={240}
          onCloseClick={() => setInfoWindowOpen(false)}
        >
          <div className="space-y-1.5 px-1 py-0.5 text-[#1F1B18]">
            <p className="font-serif text-sm font-semibold tracking-wide">
              {CLINIC_CONFIG.brandName}
            </p>
            <p className="text-xs leading-relaxed text-[#6E655F]">
              {CLINIC_CONFIG.addressLine1}
              <br />
              {CLINIC_CONFIG.addressLine2}
            </p>
            <p className="text-[11px] font-medium text-[#6E655F]">
              {CLINIC_CONFIG.hoursShort}
            </p>
            <a
              href={CLINIC_CONFIG.mapsExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-[#B68D5E] underline underline-offset-4 hover:text-[#1F1B18]"
            >
              Open in Google Maps
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </InfoWindow>
      ) : null}
    </>
  );
};

/**
 * Renders the interactive clinic map card with built-in Zoom, Map/Satellite switcher,
 * Street View, and Fullscreen controls, falling back cleanly if the Maps API key is absent
 * or fails to initialize.
 * Inputs: none (reads coordinates and links from CLINIC_CONFIG).
 * Output: React element containing the interactive map viewport.
 */
const StudioMap: React.FC = () => {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [apiLoadError, setApiLoadError] = useState(false);

  if (!apiKey || apiLoadError) {
    return (
      <div
        className="relative h-64 w-full overflow-hidden rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] sm:h-72 2xl:h-80"
        data-testid="studio-map-fallback"
      >
        <iframe
          src={CLINIC_CONFIG.mapsEmbedUrl}
          title="Elara Atelier Beverly Hills Clinic Location"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <div
      className="relative h-64 w-full overflow-hidden rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] sm:h-72 2xl:h-80"
      data-testid="studio-map-interactive"
    >
      <APIProvider
        apiKey={apiKey}
        libraries={['marker']}
        language="en"
        region="US"
        onError={() => setApiLoadError(true)}
      >
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={CLINIC_CONFIG.studioCoordinates}
          defaultZoom={15}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          disableDefaultUI={false}
          zoomControl={true}
          cameraControl={false}
          mapTypeControl={true}
          streetViewControl={true}
          fullscreenControl={true}
          scaleControl={true}
          gestureHandling="cooperative"
          className="h-full w-full"
          style={{ width: '100%', height: '100%' }}
        >
          <StudioLocationMarker position={CLINIC_CONFIG.studioCoordinates} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
};

export default StudioMap;
