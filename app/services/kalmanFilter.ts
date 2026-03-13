export class GPSKalmanFilter {
    private minAccuracy: number = 1;
    private Q_metres_per_second: number;
    private TimeStamp_milliseconds: number;
    private lat: number;
    private lng: number;
    private variance: number;

    constructor(Q_metres_per_second: number = 3) {
        this.Q_metres_per_second = Q_metres_per_second;
        this.variance = -1;
        this.TimeStamp_milliseconds = 0;
        this.lat = 0;
        this.lng = 0;
    }

    public process(
        lat_measurement: number,
        lng_measurement: number,
        accuracy: number,
        TimeStamp_milliseconds: number
    ): { latitude: number; longitude: number } {
        if (accuracy < this.minAccuracy) accuracy = this.minAccuracy;

        if (this.variance < 0) {
            // if variance < 0, object is uninitialised, so initialise with current values
            this.TimeStamp_milliseconds = TimeStamp_milliseconds;
            this.lat = lat_measurement;
            this.lng = lng_measurement;
            this.variance = accuracy * accuracy;
        } else {
            // else apply Kalman filter methodology
            const TimeInc_milliseconds = TimeStamp_milliseconds - this.TimeStamp_milliseconds;
            if (TimeInc_milliseconds > 0) {
                // time has moved on, so the uncertainty in the current position increases
                this.variance += (TimeInc_milliseconds * this.Q_metres_per_second * this.Q_metres_per_second) / 1000;
                this.TimeStamp_milliseconds = TimeStamp_milliseconds;
                // TO DO: USE VELOCITY INFORMATION HERE TO GET A BETTER ESTIMATE OF CURRENT POSITION
            }

            // Kalman gain matrix K = Covarariance * Inverse(Covariance + MeasurementVariance)
            // because K is dimensionless,
            // it doesn't matter that variance has different units to lat and lng
            const K = this.variance / (this.variance + accuracy * accuracy);
            // apply K
            this.lat += K * (lat_measurement - this.lat);
            this.lng += K * (lng_measurement - this.lng);
            // new Covariance  matrix is (IdentityMatrix - K) * Covariance
            this.variance = (1 - K) * this.variance;
        }

        return {
            latitude: this.lat,
            longitude: this.lng,
        };
    }

    public reset() {
        this.variance = -1;
        this.TimeStamp_milliseconds = 0;
        this.lat = 0;
        this.lng = 0;
    }
}

export const defaultKalmanFilter = new GPSKalmanFilter();
