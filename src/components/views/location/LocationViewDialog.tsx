/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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

import React from 'react';
import { MatrixEvent } from 'matrix-js-sdk/src/models/event';
import { ClientEvent, IClientWellKnown, MatrixClient } from 'matrix-js-sdk/src/client';

import { replaceableComponent } from "../../../utils/replaceableComponent";
import BaseDialog from "../dialogs/BaseDialog";
import { IDialogProps } from "../dialogs/IDialogProps";
import { createMap, LocationBodyContent, locationEventGeoUri, parseGeoUri } from '../messages/MLocationBody';
import { tileServerFromWellKnown } from '../../../utils/WellKnownUtils';

interface IProps extends IDialogProps {
    matrixClient: MatrixClient;
    mxEvent: MatrixEvent;
}

interface IState {
    error: Error;
}

@replaceableComponent("views.location.LocationViewDialog")
export default class LocationViewDialog extends React.Component<IProps, IState> {
    private coords: GeolocationCoordinates;
    private map?: maplibregl.Map;

    constructor(props: IProps) {
        super(props);

        this.coords = parseGeoUri(locationEventGeoUri(this.props.mxEvent));
        this.map = null;
        this.state = {
            error: undefined,
        };
    }

    componentDidMount() {
        if (this.state.error) {
            return;
        }

        this.props.matrixClient.on(ClientEvent.ClientWellKnown, this.updateStyleUrl);

        this.map = createMap(
            this.coords,
            true,
            this.getBodyId(),
            this.getMarkerId(),
            (e: Error) => this.setState({ error: e }),
        );
    }

    componentWillUnmount() {
        this.props.matrixClient.off(ClientEvent.ClientWellKnown, this.updateStyleUrl);
    }

    private updateStyleUrl = (clientWellKnown: IClientWellKnown) => {
        const style = tileServerFromWellKnown(clientWellKnown)?.["map_style_url"];
        if (style) {
            this.map?.setStyle(style);
        }
    };

    private getBodyId = () => {
        return `mx_LocationViewDialog_${this.props.mxEvent.getId()}`;
    };

    private getMarkerId = () => {
        return `mx_MLocationViewDialog_marker_${this.props.mxEvent.getId()}`;
    };

    private onZoomIn = () => {
        this.map?.zoomIn();
    };

    private onZoomOut = () => {
        this.map?.zoomOut();
    };

    render() {
        return (
            <BaseDialog
                className='mx_LocationViewDialog'
                onFinished={this.props.onFinished}
                fixedWidth={false}
            >
                <LocationBodyContent
                    mxEvent={this.props.mxEvent}
                    bodyId={this.getBodyId()}
                    markerId={this.getMarkerId()}
                    error={this.state.error}
                    zoomButtons={true}
                    onZoomIn={this.onZoomIn}
                    onZoomOut={this.onZoomOut}
                />
            </BaseDialog>
        );
    }
}
