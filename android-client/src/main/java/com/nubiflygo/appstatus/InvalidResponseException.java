package com.nubiflygo.appstatus;

/** El servidor respondió, pero el contenido no es un estado válido. */
public final class InvalidResponseException extends Exception {
    public InvalidResponseException(String message) {
        super(message);
    }
}
