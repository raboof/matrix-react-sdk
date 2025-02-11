/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { SyntheticEvent } from 'react';
import maplibregl from 'maplibre-gl';
import { logger } from "matrix-js-sdk/src/logger";
import { RoomMember } from 'matrix-js-sdk/src/models/room-member';
import { ClientEvent, IClientWellKnown } from 'matrix-js-sdk/src/client';

import DialogButtons from "../elements/DialogButtons";
import { _t } from '../../../languageHandler';
import { replaceableComponent } from "../../../utils/replaceableComponent";
import MemberAvatar from '../avatars/MemberAvatar';
import MatrixClientContext from '../../../contexts/MatrixClientContext';
import Modal from '../../../Modal';
import ErrorDialog from '../dialogs/ErrorDialog';
import { findMapStyleUrl } from '../messages/MLocationBody';
import { tileServerFromWellKnown } from '../../../utils/WellKnownUtils';

export interface ILocationPickerProps {
    sender: RoomMember;
    onChoose(uri: string, ts: number): unknown;
    onFinished(ev?: SyntheticEvent): void;
}

interface IState {
    position?: GeolocationPosition;
    error: Error;
}

/*
 * An older version of this file allowed manually picking a location on
 * the map to share, instead of sharing your current location.
 * Since the current designs do not cover this case, it was removed from
 * the code but you should be able to find it in the git history by
 * searching for the commit that remove manualPosition from this file.
 */

@replaceableComponent("views.location.LocationPicker")
class LocationPicker extends React.Component<ILocationPickerProps, IState> {
    public static contextType = MatrixClientContext;
    public context!: React.ContextType<typeof MatrixClientContext>;
    private map?: maplibregl.Map = null;
    private geolocate?: maplibregl.GeolocateControl = null;
    private marker?: maplibregl.Marker = null;

    constructor(props: ILocationPickerProps) {
        super(props);

        this.state = {
            position: undefined,
            error: undefined,
        };
    }

    private getMarkerId = () => {
        return "mx_MLocationPicker_marker";
    };

    componentDidMount() {
        this.context.on(ClientEvent.ClientWellKnown, this.updateStyleUrl);

        try {
            this.map = new maplibregl.Map({
                container: 'mx_LocationPicker_map',
                style: findMapStyleUrl(),
                center: [0, 0],
                zoom: 1,
            });

            // Add geolocate control to the map.
            this.geolocate = new maplibregl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true,
                },
                trackUserLocation: true,
            });
            this.map.addControl(this.geolocate);

            this.marker = new maplibregl.Marker({
                element: document.getElementById(this.getMarkerId()),
                anchor: 'bottom',
                offset: [0, -1],
            })
                .setLngLat(new maplibregl.LngLat(0, 0))
                .addTo(this.map);

            this.map.on('error', (e) => {
                logger.error(
                    "Failed to load map: check map_style_url in config.json "
                        + "has a valid URL and API key",
                    e.error,
                );
                this.setState({ error: e.error });
            });

            this.map.on('load', () => {
                this.geolocate.trigger();
            });

            this.geolocate.on('error', this.onGeolocateError);
            this.geolocate.on('geolocate', this.onGeolocate);
        } catch (e) {
            logger.error("Failed to render map", e);
            this.setState({ error: e });
        }
    }

    componentWillUnmount() {
        this.geolocate?.off('error', this.onGeolocateError);
        this.geolocate?.off('geolocate', this.onGeolocate);
        this.context.off(ClientEvent.ClientWellKnown, this.updateStyleUrl);
    }

    private updateStyleUrl = (clientWellKnown: IClientWellKnown) => {
        const style = tileServerFromWellKnown(clientWellKnown)?.["map_style_url"];
        if (style) {
            this.map?.setStyle(style);
        }
    };

    private onGeolocate = (position: GeolocationPosition) => {
        this.setState({ position });
        this.marker?.setLngLat(
            new maplibregl.LngLat(
                position.coords.longitude,
                position.coords.latitude,
            ),
        );
    };

    private onGeolocateError = (e: GeolocationPositionError) => {
        this.props.onFinished();
        logger.error("Could not fetch location", e);
        Modal.createTrackedDialog(
            'Could not fetch location',
            '',
            ErrorDialog,
            {
                title: _t("Could not fetch location"),
                description: positionFailureMessage(e.code),
            },
        );
    };

    private onOk = () => {
        const position = this.state.position;

        this.props.onChoose(position ? getGeoUri(position) : undefined, position?.timestamp);
        this.props.onFinished();
    };

    render() {
        const error = this.state.error ?
            <div className="mx_LocationPicker_error">
                { _t("Failed to load map") }
            </div> : null;

        return (
            <div className="mx_LocationPicker">
                <div id="mx_LocationPicker_map" />
                { error }
                <div className="mx_LocationPicker_footer">
                    <form onSubmit={this.onOk}>
                        <DialogButtons
                            primaryButton={_t('Share location')}
                            primaryIsSubmit={true}
                            onPrimaryButtonClick={this.onOk}
                            hasCancel={false}
                            primaryDisabled={!this.state.position}
                        />
                    </form>
                </div>
                <div className="mx_MLocationBody_marker" id={this.getMarkerId()}>
                    <div className="mx_MLocationBody_markerBorder">
                        <MemberAvatar
                            member={this.props.sender}
                            width={27}
                            height={27}
                            viewUserOnClick={false}
                        />
                    </div>
                    <div
                        className="mx_MLocationBody_pointer"
                    />
                </div>
            </div>
        );
    }
}

export function getGeoUri(position: GeolocationPosition): string {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const alt = (
        Number.isFinite(position.coords.altitude)
            ? `,${position.coords.altitude}`
            : ""
    );
    const acc = (
        Number.isFinite(position.coords.accuracy)
            ? `;u=${ position.coords.accuracy }`
            : ""
    );
    return `geo:${lat},${lon}${alt}${acc}`;
}

export default LocationPicker;

function positionFailureMessage(code: number): string {
    switch (code) {
        case 1: return _t(
            "Element was denied permission to fetch your location. " +
            "Please allow location access in your browser settings.",
        );
        case 2: return _t(
            "Failed to fetch your location. Please try again later.",
        );
        case 3: return _t(
            "Timed out trying to fetch your location. Please try again later.",
        );
        case 4: return _t(
            "Unknown error fetching location. Please try again later.",
        );
    }
}
